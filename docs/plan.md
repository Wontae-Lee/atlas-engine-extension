두 저장소의 실제 코드를 확인해보니, 네 목표에는 **“프론트엔드 ↔ 공용 API ↔ 엔진 실행·렌더링 런타임”** 구조가 맞아. 그리고 **Python을 전부 C++로 바꾸기보다는, Python은 제어용으로 남기고 대용량 데이터 처리와 렌더링 경로를 C++/CUDA 안에 가두는 것**을 추천해.

다만 가장 중요한 제약이 있어.

> **CUDA 버퍼를 네이티브 OpenGL에서 사용하는 것과, 그 버퍼를 VS Code Webview에서 직접 사용하는 것은 다르다.**
> 네 목표를 구현하려면 **엔진과 렌더러 사이의 인터페이스**, 그리고 **렌더러와 VS Code 화면 사이의 인터페이스**를 구분해야 해.

아래는 조회한 GitHub 코드 기준 설계안이야. 엔진은 `main`의 `07ecd879…`를 확인했으며, 실행 벤치마크까지 수행한 것은 아니야.

## 1. 현재 코드에서 실제로 바꿔야 할 부분

현재 병목 후보는 단순히 “Python을 사용한다”는 사실이 아니야.

| 확인한 위치                                 | 현재 동작                                  | 설계상 문제                                            |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| 엔진의 `src/python/atlas/_detail/array.h` | `HostBuffer`를 만들고 새 NumPy 배열에 다시 채움    | CUDA 상태 조회 시 GPU 데이터를 CPU로 가져오는 경로가 생김            |
| 익스텐션의 `engine_session.py`              | 매 계산 스텝 전에 `system.positions()`로 위치 검사 | 화면을 갱신하지 않는 스텝에서도 전체 위치 조회가 발생                    |
| 같은 파일의 `_snapshot()`                   | 위치·속도·종을 읽고 `.tolist()`로 변환            | 렌더링에 필요하지 않은 데이터까지 Python 객체로 변환                  |
| `streaming.ts`                         | 요청 완료 후 타이머를 걸어 다음 `step` 요청           | 계산 진행이 프론트엔드의 요청 주기에 연결됨                          |
| `scene_renderer.ts`                    | `canvas.getContext('2d')` 사용           | 아직 CUDA–OpenGL 연동 구조가 아니라 JavaScript에서 투영·그리기를 수행 |

각 동작은 현재 소스에서 확인했어. 특히 **GPU→CPU 복사, NumPy→리스트 변환, 요청 주기와 계산 주기의 결합**이 명확히 드러나.

따라서 지금 구조를 그대로 두고 Python 서버만 C++ 서버로 바꾸면, **동일한 데이터를 계속 복사하고 JSON으로 보내는 문제는 남아.**

내가 우선 바꾸겠다는 것은 언어보다 **데이터가 지나가는 경로**야.

---

## 2. 먼저 정정할 부분: Node 바인딩만으로 Webview에 직접 그릴 수는 없어

앞서 내가 다음처럼 설명한 것은 VS Code 환경에서는 불완전했어.

```text
C++/CUDA 엔진
    ↓
Node 바인딩
    ↓
TypedArray
    ↓
VS Code 렌더러
```

**Extension Host에서 얻은 메모리와 Webview의 렌더링 자원은 같은 것이 아니야.**

VS Code Webview는 익스텐션과 분리된 실행 문맥에서 작동하고, 일반적으로 메시지를 주고받아 통신해. 공식 Webview API와 WebGL API에는 외부 CUDA 포인터나 네이티브 OpenGL 버퍼를 그대로 가져와 사용하는 공개 경로가 없어. 따라서 Node-API 바인딩을 추가해도 이 경계가 사라지지 않아. ([비주얼 스튜디오 코드][1])

네 목표에서 가능한 방향은 다음처럼 나뉘어.

| 표시 방식                               | 엔진의 입자 데이터를 CPU로 가져오지 않는 CUDA 경로 | VS Code 내부 표시 | 대가                    |
| ----------------------------------- | -------------------------------- | ------------- | --------------------- |
| Webview에서 입자 배열을 받아 WebGL로 렌더링      | 일반적인 구현에서는 어려움                   | 가능            | GPU 상태를 브라우저에 전달하는 비용 |
| 네이티브 OpenGL에서 렌더링하고 화면을 Webview에 전달 | 엔진→렌더러 구간에서 가능                   | 가능            | 화면 인코딩·전송·디코딩 비용      |
| 별도 네이티브 OpenGL 창에서 직접 표시            | 가능                               | 별도 창          | VS Code 내부 화면이 아님     |

이 구분은 CUDA의 네이티브 그래픽 자원 등록·매핑 기능과 Webview의 메시지 기반 경계에 따른 것이야. ([NVIDIA Docs][2])

**네가 “VS Code 안에서 표시”와 “CUDA 입자 데이터를 CPU로 내리지 않기”를 함께 유지하려면, 두 번째 구조를 주 경로로 잡는 것을 추천해.**

```text
CUDA 엔진
    ↓ GPU 안에서 접근
네이티브 OpenGL 렌더러
    ↓ 렌더링된 화면
영상 전달
    ↓
VS Code Webview
```

여기서 전달하는 것은 `positions`, `velocities` 같은 시뮬레이션 snapshot이 아니라 **이미 그려진 화면**이야.

다만 이것을 **전체 경로의 완전한 zero-copy**라고 부르면 안 돼. GPU 내부 가공·동기화와 영상 처리 비용은 남아.

---

## 3. 내가 추천하는 전체 구조

핵심은 세 영역을 분리하는 것이야.

```text
┌──────────────────────────────────────────────┐
│ Frontend                                     │
│                                              │
│ React / TypeScript                           │
│ 프로젝트 편집, 실행 버튼, 상태 표시, 카메라 조작 │
│                                              │
│ 엔진 내부 구조를 모름                         │
└─────────────────────┬────────────────────────┘
                      │
                공용 Engine API
                      │
┌─────────────────────▼────────────────────────┐
│ Interactive Runtime                          │
│                                              │
│ Python: 명령 수신, 설정 전달, 세션 관리         │
│                                              │
│ C++: 계산 루프, 엔진 접근, 렌더링, 화면 출력     │
│                                              │
│ Atlas Adapter                                │
│   현재: system.fluid() / system.universe()     │
│   이후: 네가 만들 adapt API                  │
└─────────────────────┬────────────────────────┘
                      │
┌─────────────────────▼────────────────────────┐
│ atlas-engine                                 │
│                                              │
│ System / Fluid / Universe / Solver            │
│ TBB 또는 CUDA                                │
│                                              │
│ VS Code, React, WebRTC를 모름                 │
└──────────────────────────────────────────────┘
```

여기서 **Interactive Runtime**은 “엔진을 대화형으로 실행하고 보여주는 별도 실행 프로그램”이라고 이해하면 돼. 처음부터 별도 저장소로 만들 필요는 없고, 엔진 저장소 안의 선택적 구성요소로 두면 충분해.

권장 책임 경계는 다음과 같아.

| 담당 영역     | 알아야 하는 것                         | 몰라도 되는 것                               |
| --------- | -------------------------------- | -------------------------------------- |
| 엔진 개발     | 물리 계산, 상태 저장, 엔진 API             | React, VS Code 화면                      |
| 실행·렌더링 연동 | 공용 엔진 접근 API, 버퍼 수명, OpenGL/CUDA | 프론트엔드 컴포넌트 배치                          |
| 프론트엔드 개발  | 명령·설정·상태·화면 출력 API               | `FluidPositionState`, Thrust, CUDA 포인터 |

**네가 말한 “서로 내부를 몰라도 공용 인터페이스만 알면 된다”는 목표는 이 경계에서 달성하는 거야.** 그래픽 연동 작업 자체가 없어지는 것은 아니지만, 프론트엔드 전체가 그 지식을 알아야 할 필요는 없어져.

---

## 4. Python과 C++는 이렇게 나누는 게 적절해

### 결론: Python 바인딩은 유지하고, 매 스텝·매 입자 작업을 Python에서 제거

현재 엔진의 Python `System.update()`는 nanobind를 통해 C++의 `system.value.update()`를 호출해. 즉 Python에서 실행한다고 물리 계산 자체가 Python 코드로 바뀌는 것은 아니야.

또한 nanobind 자체는 CPU 버퍼 및 GPU 호환 DLPack을 이용한 복사 없는 배열 교환을 지원해. 현재 복사가 일어나는 것은 **Python 바인딩의 필연적 한계라기보다, 지금 작성된 `numpy_copy()` 기반 API의 동작**이야. 다만 DLPack도 CUDA 버퍼를 Webview로 직접 넘겨주는 해결책은 아니야. ([nanobind.readthedocs.io][3])

따라서 이렇게 나누겠어.

```text
Python에 남길 것
    명령 수신
    설정 읽기
    세션 생성 요청
    실행·중지 요청
    작은 상태 정보 전달

C++/CUDA에 둘 것
    반복 계산 루프
    엔진 상태 접근
    표시용 버퍼 가공
    CUDA–OpenGL 연동
    렌더링
    GPU 자원을 받는 인코더 연동
```

Python이 다음처럼 작동하는 형태를 목표로 하는 거야. **아래는 새로 만들 API 예시이지, 현재 존재하는 API는 아니야.**

```python
from atlas.interactive import Session

session = Session(config)

session.start()
session.pause()
session.step(10)

status = session.status()
```

`session.start()` 안에서는 네이티브 실행 루프가 시작되고, Python이 계속 다음을 반복하지 않게 해.

```python
# 실시간 실행 경로에서는 없애고 싶은 형태
while running:
    system.update()

    positions = system.positions()
    velocities = system.velocities()

    send_json(...)
```

**Python 제어층까지 C++로 재작성했을 때 추가로 얼마나 빨라지는지는 측정이 필요해.** 동일한 네이티브 계산·렌더링 경로를 호출하도록 만들면, Python을 제거하는 것보다 대용량 배열이 Python을 통과하지 않게 만드는 쪽이 우선이야.

네이티브 장시간 호출에는 GIL 해제가 필요할 수 있지만, 그것과 `System`의 동시 접근 안전성은 별개로 처리해야 해. nanobind의 `gil_scoped_release`는 인터프리터 잠금을 풀어줄 뿐, 엔진 객체를 자동으로 thread-safe하게 만들지는 않아. ([nanobind.readthedocs.io][4])

---

## 5. 엔진 노출은 “하나의 공개 진입점”으로 만들자

네가 말한 “엔진이 노출되는 파일은 하나”는 좋은 방향이야. 다만 다음 두 개를 구분하는 게 좋아.

> **공개 진입점은 하나로 만든다.**
> **내부 구현을 거대한 파일 하나에 몰아넣지는 않는다.**

### A. 엔진 내부 접근을 숨기는 Adapter

현재 C++ API로는 다음 경로를 사용할 수 있어.

```cpp
const auto& fluid = *system.fluid();
const auto& universe = *system.universe();

const auto* position_state =
    fluid.state<atlas::FluidPositionState>();

const auto* species_state =
    fluid.state<atlas::FluidSpeciesState>();
```

현재 `System`은 `fluid()`와 `universe()`를 공개하고, `Fluid`는 `state<State>()`를 통해 상태 컬럼에 접근하게 되어 있어. 이 코드를 **연동용 Adapter 안으로 제한**하면 돼.

```text
현재

Renderer / Session
        ↓
AtlasAccess
        ↓
system.fluid() / system.universe()


이후

Renderer / Session
        ↓
AtlasAccess
        ↓
atlas::adapt ...
```

그러면 네가 `adapt`를 도입할 때 프론트엔드는 물론이고, 가능하면 렌더러도 수정하지 않게 할 수 있어.

Adapter가 제공할 정보는 엔진 클래스 자체가 아니라 다음처럼 **표시에 필요한 중립적인 정보**여야 해.

```text
입자 수
위치 버퍼의 주소·자료형·간격
필요한 색상용 속성 버퍼
메모리 위치: CPU / CUDA
격자 범위
현재 스텝·시간
읽기가 유효한 기간
```

**이 버퍼 정보는 같은 런타임 프로세스 안의 네이티브 코드끼리만 사용하는 계약이야. CUDA 주소를 JSON에 넣어 프론트엔드로 보내자는 뜻은 아니야.**

### B. 프론트엔드가 사용하는 단일 API 모듈

프론트엔드는 다음 파일 하나를 공개 진입점으로 삼아.

```text
src/engine/index.ts
```

사용하는 쪽에서는:

```ts
import type { EngineClient } from '@/engine';
```

정도만 알게 하는 거지.

공개 API는 예를 들면 이런 방향이야. 관련 설정 타입은 공용 계약에서 정의한다는 전제의 **설계 예시**야.

```ts
export type ComputeBackend = 'tbb' | 'cuda';

export interface EngineClient {
    getCapabilities(): Promise<EngineCapabilities>;

    selectBackend(
        backend: ComputeBackend,
        policy: 'restart'
    ): Promise<void>;

    configure(config: SimulationConfig): Promise<void>;

    start(): Promise<void>;
    pause(): Promise<void>;
    step(count: number): Promise<void>;

    openViewport(
        options: ViewportOptions
    ): Promise<ViewportDescriptor>;

    setCamera(camera: CameraState): Promise<void>;

    onStatus(
        listener: (status: EngineStatus) => void
    ): () => void;

    close(): Promise<void>;
}
```

여기에는 다음이 없어.

```ts
engine.system.fluid
engine.getCudaPointer()
engine.getSnapshot()
engine.getAllParticlesEveryFrame()
```

**프론트엔드 개발자는 “실행하고, 편집하고, 화면을 연결한다”는 계약만 알면 되는 구조**야.

---

## 6. TBB와 CUDA의 표시 경로

현재 엔진의 `DeviceBuffer`는 CUDA 빌드에서는 `thrust::device_vector`, TBB 빌드에서는 `std::vector`야. 따라서 같은 Adapter 계약 아래에서 실제 메모리 경로를 나눌 수 있어.

### TBB

```text
System / Fluid
    ↓
CPU 메모리
    ↓ 표시할 필드만 업로드
OpenGL 버퍼
    ↓
렌더링
```

여기서는 네 말대로 별도 GPU 메모리를 쓰는 환경이라면 업로드 비용을 고려해야 해.

그래서 나는 **버퍼 재사용, 필요한 필드만 전송, 계산 주기와 표시 주기 분리**를 적용하겠어. 입자 위치를 보여주기만 하는데 모든 속도·에너지·셀 데이터를 매번 업로드하지 않는 식이야.

그리고 **TBB는 계산 backend의 이름**으로만 취급해야 해. TBB 계산을 선택했다고 반드시 소프트웨어 렌더링만 해야 하는 것은 아니므로, API에서도 계산 장치와 표시 방식을 분리하는 게 좋아.

### CUDA

권장하는 초기 경로는 다음이야.

```text
System / Fluid의 CUDA 버퍼
    ↓
CUDA에서 표시용 데이터 가공
    ↓
CUDA에 등록된 OpenGL 버퍼
    ↓
OpenGL draw
```

CUDA는 OpenGL 버퍼를 등록하고 매핑해서 접근하는 API를 제공해. 따라서 이 구간은 전체 입자 데이터를 CPU로 내려보내지 않는 방식으로 설계할 수 있어. ([NVIDIA Docs][2])

하지만 정확히 말하면:

> **기존 `thrust::device_vector`가 자동으로 OpenGL 버퍼가 되는 것은 아니야.**

처음에는 엔진 저장소와 표시용 OpenGL 버퍼의 소유권을 분리하고, **GPU 내부에서 필요한 데이터를 표시용 버퍼에 채우는 방식**을 추천해.

```text
피하려는 비용
GPU → CPU → Python → JSON → JS → GPU

초기에 허용할 비용
GPU → GPU 표시용 버퍼
```

이렇게 하면 엔진의 메모리 관리가 OpenGL에 종속되지 않아. 완전히 동일한 저장소를 계산과 렌더링에 공유하려면 엔진의 외부 버퍼 수용 방식까지 설계해야 하므로, 그것은 이후 최적화 단계로 남기는 편이 좋아.

### 동기화는 반드시 계약에 포함해야 해

렌더러가 읽는 중에 엔진이 같은 데이터를 수정하면 안 돼. CUDA 그래픽 매핑도 CUDA 접근과 그래픽 접근의 순서에 관한 규칙을 가지며, 매핑 중인 자원을 그래픽 API에서 동시에 접근하면 정의되지 않은 결과가 발생할 수 있어. ([NVIDIA Docs][5])

그래서 권장 방식은:

```text
계산 스텝 완료
    ↓
현재 상태를 읽을 수 있는 구간 확보
    ↓
표시용 버퍼에 반영
    ↓
읽기 종료
    ↓
계산 계속

렌더러는 준비된 표시용 버퍼를 사용
```

표시용 버퍼는 2~3개를 재사용하고, 늦어진 화면 때문에 계산 결과를 무한히 쌓아두지 않도록 하는 게 좋아.

목표는 **시뮬레이션 snapshot 복사·전송을 제거하는 것**이지, 메모리 수명과 동기화까지 제거하는 것이 아니야.

---

## 7. VS Code 내부 화면은 이렇게 연결

네이티브 렌더러는 익스텐션 프로세스 안이 아니라, **엔진과 함께 별도 런타임 프로세스 안**에 두겠어.

```text
VS Code Extension Host
    │
    │ 실행·중지·설정 등 작은 메시지
    ▼
Runtime 프로세스
    ├── Python 제어층
    └── C++ 구성요소
         ├── Session
         ├── AtlasAccess
         ├── atlas-engine
         ├── OpenGL Renderer
         └── 화면 인코더

OpenGL Renderer
    ↓
영상 채널
    ↓
VS Code Webview
```

이때 Python과 C++ 렌더러는 **같은 런타임 프로세스에서 바인딩으로 연결**해. 엔진을 한 프로세스, 렌더러를 또 다른 프로세스로 분리해서 GPU 메모리 공유 문제를 새로 만들지 않는 방향이야.

Webview 쪽은 WebRTC 같은 미디어 전달 경로를 통해 화면을 받고, 카메라 변경이나 선택 요청을 작은 메시지로 보내도록 설계할 수 있어. WebRTC는 브라우저의 미디어 스트림과 데이터 통신을 위한 표준 API를 제공해. ([W3C][6])

CUDA 경로의 화면 인코딩은 하드웨어가 지원한다면 네이티브 GPU 자원을 받는 경로를 검토하면 돼. 예를 들어 NVIDIA의 NVENC는 CUDA 자원을 사용하는 경로와, Linux에서 OpenGL 자원을 사용하는 경로를 문서화하고 있어. 다만 **CUDA 사용 가능 여부와 하드웨어 인코딩 가능 여부는 별도로 검사**해야 해. ([NVIDIA Docs][7])

이 구조의 중요한 대가는 분명해.

**입자 수에 비례하는 대용량 상태 전송을 피하는 대신, 화면 인코딩·디코딩 지연과 화질 설정이 생겨.** 작은 점이나 가는 선이 잘 보이는지도 검증해야 하고, 정밀한 입자·셀 선택은 화면 픽셀을 분석하는 대신 런타임에 질의하도록 하는 게 좋아.

따라서 엔진의 정확한 수치 결과와 화면 영상은 분리해야 해. **영상은 시각화이고, 과학적 수치 데이터의 대체물이 아니야.**

---

## 8. 프론트엔드 개발자가 이해하기 쉬운 `src` 구조

네 목표가 일반적인 프론트엔드 개발자에게 익숙한 구조라면, 이전에 제안한 `core/backend/project/simulation/ui`보다 **실행 환경을 먼저 나누고, Webview 내부는 기능별로 구성하는 방식**을 추천해.

```text
atlas-engine-extension/
├── src/
│   ├── extension.ts
│   │
│   ├── host/                         # VS Code / Node 환경
│   │   ├── bootstrap.ts
│   │   ├── commands/
│   │   │   ├── simulationCommands.ts
│   │   │   └── backendCommands.ts
│   │   ├── panels/
│   │   │   └── simulationPanel.ts
│   │   ├── views/                    # 기존 네이티브 TreeView
│   │   ├── services/
│   │   │   ├── runtimeManager.ts
│   │   │   └── projectStorage.ts
│   │   └── transport/
│   │       └── runtimeTransport.ts
│   │
│   ├── engine/                       # 공용 클라이언트 계층
│   │   ├── index.ts                  # 유일한 공개 진입점
│   │   ├── client.ts
│   │   └── transport.ts              # 환경 독립적인 통신 계약
│   │
│   ├── contracts/                    # 버전 관리되는 공용 계약
│   │   ├── engine.generated.ts
│   │   └── protocol.generated.ts
│   │
│   └── webview/                      # 브라우저 환경
│       ├── main.tsx
│       ├── app/
│       │   └── App.tsx
│       ├── features/
│       │   ├── project/
│       │   ├── backend/
│       │   ├── simulation/
│       │   └── viewport/
│       │       ├── Viewport.tsx
│       │       ├── cameraController.ts
│       │       └── mediaConnection.ts
│       ├── components/
│       ├── hooks/
│       ├── state/
│       ├── transport/
│       │   └── vscodeTransport.ts
│       └── styles/
│
├── tests/
│   ├── contracts/
│   ├── host/
│   └── webview/
└── package.json
```

React를 채택한다면 위처럼 구성하고, 기존의 작은 Webview를 당장 전부 React로 다시 작성할 필요는 없어. **구조 분리와 프레임워크 전환을 같은 작업으로 묶지 않는 것**을 추천해.

이 구조에서 지킬 규칙은 명확해.

**`host/`**는 VS Code API, 파일 접근, 런타임 실행을 담당해.

**`webview/`**는 사용자 인터페이스를 담당해. Docker 프로세스를 직접 실행하거나 엔진 내부 타입을 import하지 않아.

**`engine/`와 `contracts/`**는 양쪽에서 사용할 수 있는 환경 독립적인 코드로 두고, `vscode`, Node 전용 API, DOM에 의존하지 않게 해.

또한 `left/right/center`는 화면 배치 정보로만 남기고, 실제 기능은 `project`, `simulation`, `viewport`처럼 이름 붙이겠어. 그러면 상태 패널을 오른쪽에서 아래쪽으로 옮겨도 기능 파일의 소속까지 바꿀 필요가 없어.

---

## 9. 엔진 저장소에는 무엇을 추가할까?

엔진의 기존 구조는 유지하고, **선택적으로 빌드하는 대화형 실행·시각화 모듈**을 추가하겠어.

```text
atlas-engine-dev/
├── include/atlas/                    # 기존 엔진 API
├── src/atlas/                        # 기존 계산 구현
│
├── api/
│   └── interactive/
│       └── protocol.schema.json      # 공용 통신 계약
│
├── src/interactive/                  # 선택적 구성요소
│   ├── runtime_api.h                 # 공개 진입점
│   ├── session.cpp                  # 실행·중지·계산 루프
│   ├── adapter/
│   │   ├── atlas_access.h
│   │   └── atlas_access.cpp          # 현재 fluid/universe 접근
│   ├── rendering/
│   │   ├── renderer.cpp
│   │   ├── tbb_upload.cpp
│   │   └── cuda_gl.cu
│   ├── presentation/
│   │   └── ...                      # 화면 인코딩·전달
│   └── bindings.cpp                 # nanobind 연결
│
└── src/python/atlas/
    ├── ...                          # 기존 Python 라이브러리
    └── interactive/
        ├── __init__.py              # Python 공개 진입점
        └── service.py               # 얇은 명령 처리
```

**`atlas-engine` 핵심 라이브러리가 OpenGL이나 미디어 라이브러리를 필수 의존성으로 갖게 만들지는 않겠어.** 과학 계산용 Python 라이브러리와 headless 실행은 시각화 없이 사용할 수 있어야 해.

현재 익스텐션 안의 다음 파일들은 장기적으로 엔진 측 연동 패키지로 소유권을 옮기는 게 좋아.

```text
engine_session.py
engine_scene.py
engine_server.py
```

특히 현재 `engine_session.py`는 실제 `Fluid`, `Universe`, `System`, `DsmcSolver`를 조립하고 있어. 이런 코드를 프론트엔드 저장소가 계속 소유하면, 엔진 API가 바뀔 때 프론트엔드 개발자가 엔진 생성 방식을 알아야 해.

### 현재 API에서 한 가지 부족한 부분

`system.fluid()`와 `system.universe()`를 통해 입자와 격자 상태에 접근하는 방향은 가능해. 하지만 **움직이는 모든 geometry의 현재 포즈까지 그 두 객체만으로 자동으로 얻을 수 있는 것은 아니야.**

조회한 `System` 공개 API에서는 충돌체 목록의 현재 상태를 읽는 접근자가 보이지 않고, 현재 익스텐션도 geometry는 설정된 초기 포즈를 표시한다고 명시하고 있어.

그래서 초기에는 정적 geometry 표시를 유지하되, **동적 geometry까지 실제 계산 상태와 일치시키려면 Adapter에 읽기 전용 포즈 접근 계약을 추가**해야 해. 프론트엔드에서 물체 운동을 별도로 재계산하는 방식은 피하겠어.

---

## 10. TBB 기본값과 CUDA 선택은 어떻게 구현할까?

현재 `ATLAS_DEVICE_SYSTEM`은 CMake의 빌드 옵션이야. 따라서 지금 구조에서는 **한 엔진 인스턴스의 boolean 설정을 바꾸는 문제가 아니라, 해당 backend로 빌드된 런타임을 선택하는 문제**로 다뤄야 해.

권장 흐름은:

```text
기본 시작
    → TBB 런타임 실행

CUDA 선택
    → CUDA 런타임 준비
    → 실제 장치·엔진 초기화 검사
    → 그래픽 연동 검사
    → 표시 경로 검사
    → 준비 완료 후 전환
```

공용 API에는 계산 backend와 표시 기능을 따로 알려줘야 해.

```ts
interface EngineCapabilities {
    computeBackend: 'tbb' | 'cuda';

    rendering: {
        available: boolean;
        cudaInterop: boolean;
    };

    presentation: {
        videoAvailable: boolean;
        hardwareEncoding: boolean;
    };
}
```

이렇게 해야 **“CUDA 계산은 되지만 선택한 표시 경로는 사용할 수 없음”** 같은 상태도 제대로 표현할 수 있어.

현재 엔진은 backend별로 빌드되므로, 초기 전환 정책은 **현재 계산을 새 backend에서 재초기화**하는 것으로 명시하겠어. 실행 중 상태를 완전히 이어받으려면 별도의 상태 이전 계약이 필요하고, 그것을 단순 backend 선택 기능에 숨기면 안 돼.

### Docker 설정도 변경 대상

현재 익스텐션은 컨테이너를 `--network none`으로 실행하고 Python 코드를 주입해. 영상 전달 경로를 추가한다면 현재 실행 방식과 네트워크 정책도 함께 바꿔야 해.

NVIDIA 컨테이너에서는 계산용 `compute` 외에도 OpenGL/EGL용 `graphics`, 영상 인코딩용 `video` 같은 드라이버 기능 설정이 별도로 필요해. 단순히 `--gpus all`이 있다는 것만으로 렌더링·인코딩까지 검증됐다고 보면 안 돼. ([NVIDIA Docs][8])

서비스는 로컬 접근으로 제한하고, 세션별 인증 및 Webview의 연결 허용 정책을 함께 설계하겠어. 엔진 코드 실행 기능을 가진 서비스를 인증 없이 외부에 노출하는 구조는 피해야 해.

---

## 11. 독립 개발을 가능하게 하는 것은 폴더보다 계약과 테스트야

공용 인터페이스에는 메서드 이름뿐 아니라 **그 메서드가 언제 완료되는지**도 정해야 해.

예를 들어 이 설계에서는 다음 의미를 명시하겠어.

| API/이벤트       | 계약                                                |
| ------------- | ------------------------------------------------- |
| `start()`     | 런타임이 자체 계산 루프를 시작함. 프론트엔드가 반복 `step` 요청을 보낼 필요 없음 |
| `pause()`     | 안전한 계산 경계에서 정지한 뒤 완료됨                             |
| `step(n)`     | 일시정지 상태에서 정확히 `n`번 진행하고 완료됨                       |
| `configure()` | 설정 검증과 적용 결과를 반환함                                 |
| 상태 이벤트        | 세션 ID와 적용된 설정 revision을 포함함                       |
| 화면 갱신         | 계산 속도와 독립적이며, 오래된 표시 작업을 무한히 쌓지 않음                |
| backend 변경    | 현재 단계에서는 재초기화 정책을 명시함                             |

프론트엔드는 이 계약을 구현한 **가짜 `EngineClient`**만으로 개발할 수 있게 해.

```text
Frontend 테스트
    → MockEngineClient
    → Docker / CUDA / 실제 엔진 불필요

Engine 연동 테스트
    → 공용 프로토콜 요청·응답 검사
    → React / VS Code 화면 불필요

통합 테스트
    → 실제 런타임과 실제 Webview 연결
```

설정 자료형, 오류 코드, 프로토콜 버전은 공용 계약에서 관리하고, TypeScript 타입과 서버 측 검증이 서로 어긋나지 않도록 해야 해. 프론트엔드에는 편집 편의용 검증을 둘 수 있지만, **최종 유효성 판정은 엔진 측에서 수행**하도록 하겠어.

---

## 12. 실제 변경 순서

한 번에 현재 동작을 전부 없애지 말고 다음 순서로 진행하는 게 좋아.

**첫 번째: 공용 API와 엔진 접근 경계부터 만든다.**
현재 구현을 `EngineClient` 뒤에 숨기고, 엔진 생성·상태 접근 코드를 엔진 측 연동 패키지로 모아. 이 단계에서는 기존 snapshot 경로를 내부적으로 유지해도 돼.

**두 번째: 계산 루프를 런타임으로 옮긴다.**
`streaming.ts`가 계산을 타이머로 진행시키지 않게 바꾸고, Python의 매 스텝 `positions()` 조회를 제거할 수 있도록 동일한 안전 검사를 네이티브 쪽으로 옮겨. 검사를 그냥 삭제하는 것은 아니야.

**세 번째: TBB 업로드와 CUDA–OpenGL 네이티브 렌더링을 먼저 검증한다.**
Webview 연결 전에 동일한 렌더러로 데이터 접근·동기화·성능을 확인해. 이 단계에서 현재 `system.fluid()/universe()` 기반 Adapter를 사용하면 돼.

**네 번째: Webview에 화면 전달 경로를 연결한다.**
표시 지연, 화질, 카메라 응답, backend 전환을 검증한 다음, 기존 실시간 snapshot 전달 경로를 제거해.

성능 판정은 다음 기준으로 하겠어.

```text
계산 스텝 시간
시각화 때문에 추가되는 GPU→CPU 전송량
Python에서 입자 수에 비례해 수행되는 작업
렌더링 시간
화면 전달 지연
메모리 사용량과 오래된 화면의 적체
```

특히 CUDA 경로의 목표는 **“시각화를 위해 전체 입자 배열을 CPU로 가져오지 않는다”**야. 엔진 내부의 카운터 확인이나 다른 기능에서 발생할 수 있는 작은 전송까지 전부 없어진다고 주장하는 것은 아니야. 현재 `Fluid::compact()` 설명에도 생존 입자 수를 읽어오는 동작이 명시돼 있어.

---

### 최종 추천

**네 프로젝트에는 “Python을 유지한 제어 서비스 + C++/CUDA 네이티브 계산·렌더링 + TypeScript 프론트엔드”를 추천해.**

공용 진입점은 프론트엔드의 `engine/index.ts`와 엔진 측 `runtime_api`로 제한하고, 현재 `system.fluid()/universe()` 접근은 Adapter 내부에만 둬. 네가 이후 `adapt`를 만들면 그 내부를 교체하면 돼.

그리고 **VS Code 내부 표시를 유지한다면, CUDA 버퍼를 Webview에 직접 넘기는 것이 아니라 네이티브에서 그린 화면을 전달하는 구조**로 잡아야 해. 이 경계를 받아들이면 엔진 개발, 그래픽 연동, 프론트엔드 개발을 서로 분리하면서도 현재의 대용량 snapshot 경로를 제거할 수 있어.

[1]: https://code.visualstudio.com/api/extension-guides/webview "Webview API | Visual Studio Code Extension API"
[2]: https://docs.nvidia.com/cuda/cuda-runtime-api/group__CUDART__OPENGL.html "CUDA Runtime API :: CUDA Toolkit Documentation"
[3]: https://nanobind.readthedocs.io/en/latest/ndarray.html "The nb::ndarray<..> class - nanobind documentation"
[4]: https://nanobind.readthedocs.io/en/latest/api_core.html "C++ API Reference (Core) - nanobind documentation"
[5]: https://docs.nvidia.com/cuda/cuda-runtime-api/group__CUDART__INTEROP.html "CUDA Runtime API :: CUDA Toolkit Documentation"
[6]: https://www.w3.org/TR/webrtc/ "WebRTC: Real-Time Communication in Browsers"
[7]: https://docs.nvidia.com/video-technologies/video-codec-sdk/13.0/nvenc-video-encoder-api-prog-guide/index.html "NVENC Video Encoder API Programming Guide"
[8]: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html "Specialized Configurations with Docker — NVIDIA Container Toolkit"


맞아. **지금 말한 렌더링/영상 스트리밍 기능을 하나의 Docker 이미지 안에 넣는다면 같이 배포해야 해.** 그런데 나는 그렇게 **엔진 기본 이미지에 전부 박는 구조는 추천하지 않아.**

`atlas-engine-dev`는 지금 계산 엔진 자체가 중심이고, TBB/CUDA도 빌드 옵션으로 분리되어 있잖아. 여기에 OpenGL, NVENC, WebRTC까지 기본 의존성으로 넣으면 이미지가 커지고 headless 연구 사용자도 필요 없는 그래픽 의존성을 받게 돼.

그래서 Docker도 계층을 나누는 게 좋아.

```text
atlas-engine-dev
│
├── atlas-engine:tbb
│      C++ engine
│      Python binding
│      TBB
│
├── atlas-engine:cuda
│      C++ engine
│      Python binding
│      CUDA runtime
│
├── atlas-engine-interactive:tbb
│      atlas-engine:tbb 기반
│      + OpenGL/EGL
│      + renderer
│      + encoder / streaming runtime
│
└── atlas-engine-interactive:cuda
       atlas-engine:cuda 기반
       + CUDA/OpenGL interop
       + OpenGL/EGL
       + NVENC
       + encoder / streaming runtime
```

즉 **일반 엔진 사용자**는:

```bash
docker pull .../atlas-engine:tbb
```

또는

```bash
docker pull .../atlas-engine:cuda
```

만 받으면 돼.

VS Code extension은:

```text
기본
→ atlas-engine-interactive:tbb

CUDA 선택
→ atlas-engine-interactive:cuda
```

를 사용하고.

이게 중요한 이유는 엔진 자체와 frontend용 runtime의 책임을 분리할 수 있기 때문이야.

```text
atlas-engine
    계산만 책임

interactive runtime
    엔진 실행
    실시간 visualization
    graphics interop
    video delivery 책임

VS Code extension
    UI와 사용자 interaction 책임
```

### Dockerfile도 중복 작성할 필요는 없어

예를 들면 multi-stage / base-image 구조로 만들 수 있어.

```dockerfile
FROM atlas-engine:cuda AS engine

FROM nvidia/cuda:... AS interactive

COPY --from=engine /opt/atlas /opt/atlas

# OpenGL / EGL
# interactive runtime
# renderer
# encoder
```

또는 같은 저장소에서:

```text
docker/
├── Dockerfile.engine
└── Dockerfile.interactive
```

정도로 관리할 수 있고.

더 깔끔하게는:

```text
engine image
      ↑
interactive image
```

처럼 interactive가 engine을 상속하도록 하면 돼.

---

그리고 **CUDA interactive 이미지**가 특히 무거워질 가능성이 있어.

왜냐하면 런타임에 필요할 수 있는 게:

```text
atlas-engine
CUDA runtime
Python
OpenGL / EGL
graphics interoperability support
video encoder interface
streaming runtime
```

이기 때문이야.

반면 기존 headless engine에서는:

```text
OpenGL
NVENC
WebRTC
```

가 전혀 필요 없지.

그래서 전부 합쳐서:

```text
atlas-engine:latest
```

하나로 만드는 것보다는 분리하는 게 훨씬 낫다.

---

### 더 좋은 점

이렇게 하면 프론트엔드 개발자는 Docker 이미지 내부가 어떻게 생겼는지도 몰라도 돼.

Extension은 그냥:

```ts
engine.start({
    backend: 'cuda'
});
```

라고 하고,

`RuntimeManager`가 알아서:

```text
cuda
 ↓
interactive CUDA image 선택
 ↓
container 실행
 ↓
runtime API 연결
```

하면 돼.

즉 프론트엔드는:

```text
TBB image 이름
CUDA toolkit
NVENC
OpenGL
Docker arguments
```

이런 걸 전혀 몰라도 된다.

---

### 장기적으로는 이런 릴리스 구성이 괜찮아

예를 들어 버전 `0.2.0`이면:

```text
atlas-engine:tbb-0.2.0
atlas-engine:cuda-0.2.0

atlas-engine-interactive:tbb-0.2.0
atlas-engine-interactive:cuda-0.2.0
```

그리고 convenience tag:

```text
atlas-engine:tbb
atlas-engine:cuda

atlas-engine-interactive:tbb
atlas-engine-interactive:cuda
```

식으로.

다만 실제 registry naming은 하나의 image repository에 여러 tag를 쓰거나, 별도 repository로 나눌 수도 있어.

---

네 경우에는 한 가지를 더 추천해. **interactive renderer를 `atlas-engine-dev`의 필수 부분으로 만들지 말고 optional target으로 두는 것**이 좋아.

예를 들면 CMake에서:

```cmake
option(
    ATLAS_INTERACTIVE
    "Build interactive visualization runtime"
    OFF
)
```

그러면 일반 엔진은:

```bash
-DATLAS_INTERACTIVE=OFF
```

이고,

VS Code용 Docker는:

```bash
-DATLAS_INTERACTIVE=ON
```

으로 만드는 식.

결국 구조는:

```text
               atlas-engine-dev
                     │
            ┌────────┴────────┐
            │                 │
       engine only       interactive
            │                 │
       TBB / CUDA         TBB / CUDA
```

가 가장 깔끔해.

**즉 "Docker로 배포하니까 전부 같이 넣어야 한다"가 아니라, VS Code용 Docker 이미지에는 같이 넣되 일반 엔진 Docker와는 분리하는 것**이 좋아. 이렇게 해야 나중에 엔진만 쓰는 Python/C++ 사용자와 extension 사용자가 서로 필요 없는 의존성을 떠안지 않아.



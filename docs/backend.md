# Docker 백엔드 사용하기

확장을 시작하면 아래 상태 표시줄에 `atlas-engine-backend: TBB`가 표시된다.
최초 기본값은 CPU에서 실행하는 TBB다. Docker에 이미지가 없으면 다운로드하고,
컨테이너에서 Atlas import·네이티브 연산·메모리 초기화와 읽기를 확인한 뒤 연결 상태로 바뀐다.
성공적으로 선택한 백엔드는 VS Code의 확장 전역 상태에 저장되어 다음 시작에 사용된다.

## TBB / CUDA 선택

상태 표시줄을 클릭하거나 명령 팔레트에서 `Atlas Engine: Select Backend`를 실행한다.

- **TBB**: NVIDIA GPU 없이 실행한다.
- **CUDA**: 먼저 Docker 서버에서 NVIDIA GPU와 드라이버·컨테이너 GPU 접근을 확인한다.
  사전 검사가 실패하면 원인을 안내하고 CUDA 이미지를 다운로드하지 않는다.
  이미지가 없을 때에는 약 2.5 GB 다운로드에 대한 설치 확인 창을 표시한다.
  설치에 동의한 경우에만 다운로드하며, 컨테이너 안의 실제 CUDA 연산 검사까지 성공한 뒤 전환한다.

취소하거나 새 백엔드 준비가 실패하면 기존 연결을 유지한다.
CUDA가 실패했다고 선택을 몰래 변경하거나 시스템 드라이버를 자동 설치하지 않는다.
오류 상세 내용과 다운로드 로그는 Output의 `atlas-engine-backend`에서 확인한다.
연결이 끊겼다면 상태 표시줄에서 백엔드를 다시 선택한다.

GPU 사전 검사는 이미 설치한 TBB 이미지에 `--gpus all`을 지정하여 수행한다.
CUDA 런타임 이미지 없이도 Docker의 GPU 접근을 확인할 수 있다.
컴퓨트 성능은 이미지가 지원하는 7.5 이상이 필요하며, 실제 실행 가능 여부는
선택한 CUDA 이미지의 드라이버 요구 조건과 컨테이너 내부 연산 검사로 최종 확인한다.

## 실행 확인

명령 팔레트에서 `Atlas Engine: Check Backend`를 실행한다.
현재 연결로 upstream의 `dsmc_dense_cell.py` 예제를 요청하고, 성공 여부와 결과를 Output에 남긴다.
예제는 200개 입자를 8개 셀에서 20단계 진행한다.

호스트에는 Docker CLI와 접근 가능한 Linux x86-64 Docker 서버가 필요하다.
CUDA는 해당 Docker 서버의 NVIDIA 드라이버와 NVIDIA Container Toolkit 설정도 필요하다.
원격 Docker context를 사용하면 로컬 PC가 아닌 Docker 서버의 GPU가 검사 대상이다.

사용 이미지:

```text
ghcr.io/wontae-lee/atlas-engine-dev:tbb-ubuntu22.04
ghcr.io/wontae-lee/atlas-engine-dev:cuda-ubuntu22.04
```

이미지는 [Atlas Engine 저장소](https://github.com/Wontae-Lee/atlas-engine-dev)의 공개 GHCR 이미지를 사용한다.
태그는 변경될 수 있으며, 다운로드 여부는 Docker의 로컬 이미지 존재 여부로 판단한다.
이미 설치된 이미지를 시작할 때마다 새로 다운로드하지 않는다.

## 코드와 통신

```text
System
  └─ Backend                     선택 상태·연결 교체·실행 흐름
       ├─ BackendUi              상태 표시줄·선택 창·진행 알림·로그
       ├─ BackendSetup           GPU 검사·설치 동의·이미지 준비 순서
       └─ DockerBackend          이미지 확인·다운로드·GPU 사전 검사
            └─ ContainerConnection    컨테이너 실행·종료·정리
                 └─ RequestChannel    요청 ID·JSON 응답·취소·시간 초과
                      └─ Python bridge
                           ├─ info    버전·백엔드·네이티브 연산 확인
                           └─ smoke   공식 예제 실행
```

외부에서 사용하는 `Backend`, `DockerBackend`와 공통 타입은 `src/atlas/backend/`에 둔다.
`src/atlas/detail/`은 backend뿐 아니라 views·commands·panels 등 여러 모듈의 내부 구현을 모으는 공통 디렉터리다.
`System`과 명령 클래스는 `Backend`를 통해 동작하며 `detail` 파일을 직접 사용하지 않는다.

| 파일 (`src/atlas/` 기준) | 담당하는 구현 |
| --- | --- |
| `backend/backend.ts` | 선택 상태, 작업 중복 방지, 연결 검증·교체, 선택 저장, 종료 |
| `backend/docker_backend.ts` | 이미지 확인·다운로드, Docker GPU 검사, 연결 생성 |
| `backend/backend_types.ts` | 모드·이미지 주소와 `BackendTransport`·`BackendConnection` 계약 |
| `detail/backend_setup.ts` | TBB 이미지 준비, CUDA 사전 검사 → 동의 → 다운로드 순서 |
| `detail/backend_ui.ts` | 상태 표시줄, 선택·설치 확인 창, 취소 가능한 진행 알림, Output |
| `detail/container_connection.ts` | Docker 컨테이너 수명과 `info`·`smoke` 결과 타입 검증 |
| `detail/request_channel.ts` | 줄 단위 JSON, 요청 ID별 응답 연결, 취소·시간 초과와 대기 요청 정리 |
| `detail/private_helpers.ts` | 여러 모듈에서 공유하는 오류 메시지·취소 오류 처리, Docker 실행·컨테이너 정리 판정 |
| `detail/docker_error.ts` | Docker 명령 실패와 stderr를 담는 오류 클래스 |
| `detail/bridge.ts` | 컨테이너 안에서 Atlas Python API를 호출하는 코드 |

`Backend.connect()`는 `BackendSetup.prepare()`로 이미지를 준비한 뒤,
`replace_connection()`으로 새 연결을 검증·교체하고 선택을 저장한다.
`BackendSetup`은 같은 `BackendTransport`를 받아 Docker 작업을 호출하며,
UI가 필요한 설치 동의와 로그는 `BackendUi`에 맡긴다.
진행 알림의 취소 이벤트를 `AbortController`에 연결하는 공통 처리도 `BackendUi`에 모았다.

`detail/bridge.ts`의 Python 코드가 이미지 내부 Python API를 호출한다.
공개 이미지에는 통신 서버가 없기 때문에 이 bridge를 컨테이너 실행 시 전달한다.

통신은 표준 입출력의 줄 단위 JSON으로 이루어진다.
각 요청에는 숫자 ID와 메서드가 있으며, 응답에는 같은 ID와 result 또는 error가 있다.
프로토콜 출력과 네이티브 로그는 별도의 파일 디스크립터로 분리한다.
현재는 연결 정보와 동작 검증을 제공하며, 임의 Python 실행이나 시뮬레이션 편집 API는 제공하지 않는다.

컨테이너마다 고유 이름을 사용하고 네트워크는 끄며 호스트 폴더를 마운트하지 않는다.
전환·종료·취소 시 확장이 소유한 컨테이너만 제거한다.
강제 프로세스 종료나 Docker 서버 장애 시에는 정리가 완료되지 않을 수 있다.
이미지는 캐시에 남겨 다음 실행에 재사용한다.

## 이번 환경에서 확인한 사항

아래는 초기 Docker 통합 구현에서 확인한 기록이다.
이후 snake_case 이름 정리와 `detail` 분리 변경 후에는 빌드·테스트를 다시 실행하지 않았다.

- TBB 이미지 다운로드와 공식 예제 실행 성공: 8개 셀, 200개 입자, 20단계.
- 동일한 실행을 JSON 통신 계층을 통해 요청하고 응답 확인.
- `npm test` 통과: VS Code 통합, 전환·취소, 통신 오류·프로세스 정리 등 13개 테스트.
- 호스트 GPU: RTX 4070. Docker GPU 검사: NVIDIA 런타임/CDI 설정 문제로 실패.
- CUDA 이미지는 다운로드하지 않았으며 CUDA 연산의 실제 성공은 확인하지 못했다.

GPU 설정 방법은 [NVIDIA Container Toolkit 공식 문서](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)를 참고한다.

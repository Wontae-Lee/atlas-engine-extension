# 클래스 기반 확장과 manifest 생성

뷰·명령·패널은 공통 부모를 상속한 `src`의 클래스에서 관리한다.
`src/atlas/contributions.ts`의 `createContributions()`가 구성 객체를 만들고,
`System`과 manifest 생성기가 같은 함수를 사용한다.
루트 `package.json`은 생성 결과이므로 직접 수정하지 않고 Git에는 함께 커밋한다.

| 파일 | 역할 |
| --- | --- |
| `src/extension.ts` | System 생성, 확장 종료 시 정리 연결, 최초 update() 호출 |
| `src/atlas/system/system.ts` | 객체 소유, VS Code 등록, 명령 실행과 화면 갱신 흐름 관리 |
| `src/atlas/backend/backend.ts` | 백엔드 선택 상태, 연결 교체·검증과 실행 흐름 관리 |
| `src/atlas/backend/docker_backend.ts` | 이미지 관리, GPU 검사와 컨테이너 연결 생성 |
| `src/atlas/backend/backend_types.ts` | 백엔드·통신 계약과 이미지 주소 |
| `src/atlas/detail/` | backend·views·commands·panels 등 여러 모듈의 내부 구현 |
| `src/atlas/detail/private_helpers.ts` | 여러 모듈에서 공유하는 오류·취소·실행·정리 헬퍼 |
| `src/atlas/views/view.ts` | 사이드바 뷰의 공통 선언·등록·갱신·정리 |
| `src/atlas/views/overview.ts` | View를 상속한 Overview의 선언과 트리 내용 |
| `src/atlas/commands/command.ts` | 명령 ID·제목과 execute()를 규정하는 부모 클래스 |
| `src/atlas/commands/hello_world.ts` | Command를 상속한 Hello World의 실행 동작 |
| `src/atlas/panels/panel.ts` | 에디터 Webview 패널의 열기·갱신·정리와 render() 계약 |
| `src/atlas/contributions.ts` | 컨테이너 선언과 뷰·명령·패널 인스턴스 구성 |
| `config/package.jsonc` | 프로젝트 이름·버전·진입점 |
| `config/scripts.jsonc` | npm 명령 |
| `config/dependencies.jsonc` | 의존성·overrides |
| `scripts/read_contributions.cjs` | 구성 모듈을 메모리에서 번들링하고 인스턴스의 선언 정보 읽기 |
| `scripts/generate_manifest.py` | JSONC와 선언 정보를 합쳐 JSON 출력 |

백엔드 내부 파일의 역할과 호출 흐름은 [Docker 백엔드 문서](backend.md#코드와-통신)에 정리했다.
`detail` 내부 구현을 나누어도 뷰·명령 선언과 manifest 생성 방식은 동일하다.

## 소유와 실행 흐름

`extension.ts`에서는 확장 전체 흐름을 구성하지 않고 `System`에 맡긴다.

```ts
const system = new System(vscode);
context.subscriptions.push(system);
system.update();
```

`System` 생성자는 `createContributions()`로 객체를 만들고 명령과 뷰,
패널을 여는 명령을 등록한다. `update()`는 최초 백엔드 연결을 시작하고 뷰와 열린 패널을 갱신한다.
등록과 갱신이 분리되어 있으므로 `update()`를 다시 호출해도 등록을 반복하지 않는다.
명령이 성공적으로 완료되거나 패널을 여는 명령이 실행되면 `System`이 다시 `update()`를 호출한다.
VS Code의 이벤트 흐름 안에서 호출하며, 별도의 무한 루프나 주기적 타이머는 사용하지 않는다.
백엔드는 `Backend`가 소유하며, 실제 이미지 다운로드와 프로세스 실행은 초기화 이후에 시작한다.
확장 종료 시 VS Code가 `System.dispose()`를 호출하면 소유한 등록과 화면 자원을 정리한다.

```text
extension.ts
  └─ System
       ├─ Command[] → HelloWorld extends Command
       ├─ View[]    → Overview extends View
       └─ Panel[]  → 추가할 패널 클래스 extends Panel
```

`ViewClass`·`CommandClass` 같은 클래스 생성자 계약은 사용하지 않는다.
부모 클래스가 공통 동작을 제공하고, 구성 목록에는 `new Overview()` 같은 인스턴스를 넣는다.
현재 제공되는 화면은 Overview 사이드바 뷰이고 구체 패널은 아직 등록되어 있지 않다.

## 새 뷰 추가

1. `src/atlas/views/projects.ts`에 클래스를 작성한다.
2. `src/atlas/contributions.ts`에서 import하고 `createContributions()`의 `views`에 인스턴스를 추가한다.
3. 개발 watch가 빌드와 manifest를 갱신하면 VS Code에서 `Developer: Reload Window`를 실행한다.

```ts
import type * as vscode from 'vscode';
import { View } from './view';

export class Projects extends View {
    constructor() {
        super('atlas-engine.projects', 'Projects', 'atlas-engine', 'No projects yet.');
    }

    getChildren(): vscode.TreeItem[] {
        return [];
    }
}
```

구성 함수 안의 목록은 `views: [new Overview(), new Projects()]`처럼 관리한다.
`welcome`은 선택 사항이다. 컨테이너 ID는 구성 함수가 반환하는 `containers`에 있어야 한다.
`getTreeItem()`의 기본 동작과 트리 갱신 이벤트는 부모 `View`가 담당한다.
뷰마다 필요한 트리 내용은 `getChildren()`에서 제공한다.
`new this.api.TreeItem(...)`처럼 실제 API가 필요한 작업은 초기화 이후 호출되는
메서드에서 수행한다. 부모가 제공하는 `this.api`는 생성자에서는 사용할 수 없다.

새 명령은 `Command`를 상속하고 생성자에서 `super(id, title)`을 호출한다.
`execute(api, ...args)`에서 전달받은 VS Code API로 동작을 구현한 뒤
`commands`에 인스턴스를 추가한다. `extension.ts`는 수정하지 않는다.

## 새 패널 추가

사이드바 내부 영역은 `View`이고, 에디터 탭으로 열리는 HTML 화면은 `Panel`이다.
패널은 `src/atlas/panels/`에 부모 `Panel`을 상속한 클래스로 작성한다.

```ts
import { Panel } from './panel';

export class Inspector extends Panel {
    constructor() {
        super('atlas-engine.inspector', 'Inspector');
    }

    protected render(): string {
        return '<!DOCTYPE html><html><body><h1>Inspector</h1></body></html>';
    }
}
```

`createContributions()`의 `panels`에 `new Inspector()`를 추가하면
생성기가 `atlas-engine.inspector.open` 명령을 manifest에 넣고,
`System`이 같은 명령으로 해당 패널을 열도록 연결한다.
이미 열려 있으면 기존 패널을 표시한다. 뷰용 `views` 선언은 추가하지 않는다.
`render(webview)`는 HTML을 반환하며, 필요하면 전달받은 Webview로 리소스 URI를 만든다.
닫힌 패널은 `System.update()`만으로 다시 열리지 않는다.

## 생성 시 실행 가능한 코드

생성기는 TypeScript를 정적으로 분석하는 대신 등록 모듈을 메모리에서 번들링하고 실행한다.
이어 `createContributions()`를 호출하므로 최상위 코드뿐 아니라 생성자와 필드 초기화도 실행된다.
따라서 구성 모듈과 클래스의 생성자는 선언 정보를 설정하는 작업만 수행해야 한다.
VS Code API 호출, 파일 변경, 프로세스 실행 같은 부수 효과는 런타임 동작에 둔다.
생성기는 `System`을 만들거나 `execute()`·`show()`·`render()`를 호출하지 않는다.

구성 함수에서 사용하는 파일의 VS Code 타입은 `import type`으로 가져온다.
실제 API는 `extension.ts`에서 `System`으로 전달하고,
`System`이 초기화·명령 실행·패널 열기 단계에 주입한다.
일반 Node.js에서는 `vscode` 런타임을 제공하지 않으므로 생성기가 읽는 파일에서
최상위 런타임 import를 사용하면 안 된다. 명령 안에서 동적 import를 할 필요도 없다.

## 실행과 자동 갱신

먼저 `npm ci`로 esbuild 등 개발 의존성을 설치한다. Python 3와 Node.js가 필요하다.

```bash
npm run dev
```

개발 실행과 compile/package, esbuild의 매 빌드 시작 시 manifest를 생성한다.
등록된 TypeScript 파일이나 목록을 수정하면 esbuild watch가 이를 감지한다.
VS Code의 뷰 선언 반영에는 창 Reload가 필요하다.

수동 생성:

```bash
npm run manifest
```

또는 `python3 scripts/generate_manifest.py`를 직접 실행한다.
프로젝트 JSONC 설정만 바뀐 경우에는 자동 감시하지 않으므로 수동 생성한다.
npm 명령 자체를 바꿨다면 생성한 다음 새 명령을 실행한다.

JSONC는 줄 주석·블록 주석·후행 쉼표를 지원하며 결과에서는 제거된다.
객체는 재귀 병합하고 배열은 이어 붙인다. 단일 설정 충돌은 오류다.
구성 목록의 중복 ID와 없는 컨테이너 참조도 오류로 처리한다.
전체 선언을 읽고 병합한 뒤에만 package.json을 쓴다.

의존성 변경은 `config/dependencies.jsonc`에서 하고 생성 후 `npm install`로
lockfile을 갱신한다. npm이 package.json에 쓴 변경을 JSONC로 자동 역변환하지는 않는다.

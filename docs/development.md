# CLion에서 VS Code 확장 개발하기

이 프로젝트는 CLion에서 TypeScript를 편집하고, VS Code의 Extension Host에서 실행한다.
브레이크포인트는 CLion의 Node.js 디버거를 Extension Host에 연결해서 사용한다.
`src/extension.ts`를 일반 Node.js 프로그램처럼 직접 실행하지 않는다. `vscode` API는 VS Code가 제공한다.
manifest, 활성화 생명주기와 코드 구성은 [VS Code 확장 구조 이해하기](vscode.md)를 참고한다.
뷰·명령·패널은 공통 부모를 상속하고 `src/atlas/contributions.ts`에서 인스턴스를 구성한다.
`extension.ts`는 `System`을 생성하고 `system.update()`를 호출하며, 실제 흐름은 `System`이 관리한다.
프로젝트 설정은 `config`의 JSONC로 관리하며 `package.json`은 자동 생성한다.
자세한 방법은 [클래스 기반 확장과 manifest 생성](manifest.md)을 참고한다.
Docker 이미지 연결과 TBB/CUDA 선택은 [백엔드 사용 방법](backend.md)을 참고한다.
전체 문서 목록은 [문서 안내](README.md)에 있다.

## 1. 다음에 다시 시작할 때

CLion 터미널에서 프로젝트 루트로 이동한 후 실행한다.

```bash
npm run dev
```

스크립트가 다음 작업을 수행한다.

1. Node.js, npm, VS Code CLI를 확인한다.
2. `node_modules`가 없으면 `npm ci`로 의존성을 설치한다.
3. 클래스 선언과 JSONC로 manifest를 생성하고 타입 검사, ESLint 검사, esbuild 빌드를 실행한다. 실패하면 개발 창을 열지 않는다.
4. 별도 설정과 확장 저장소를 사용하는 개발용 VS Code 창을 연다.
5. TypeScript 검사와 esbuild를 watch 모드로 실행한다.

개발 창 왼쪽 액티비티 바에서 `Atlas Engine` 로고를 클릭한다.
사이드바의 `Overview`에 환영 문구와 `Hello World` 버튼이 표시된다.
버튼을 클릭하거나 `Ctrl+Shift+P`에서 `Hello World`를 실행한다.
`Hello World from atlas-engine!` 알림이 나타나면 수동 확인에 성공한 것이다.
스크립트가 명령을 자동으로 클릭하거나 알림 내용을 검증하는 것은 아니다.

시작 완료 시 확장이 자동 활성화되어 `atlas-engine-backend` 상태 표시줄을 만들고
저장된 백엔드에 연결한다. 최초 기본값은 TBB이며, 이미지가 없으면 다운로드한다.
실제 백엔드 연결에는 Docker CLI와 실행 중인 Linux x86-64 Docker 서버가 필요하다.
Docker 연결 실패는 Output에서 확인하고, 상태 표시줄을 클릭해 다시 연결할 수 있다.

작업을 끝낼 때는 터미널에서 `Ctrl+C`로 watch를 중단하고 개발용 VS Code 창도 닫는다.
개발 창을 닫는 것만으로 watch가 종료되지는 않는다.

## 2. 처음 한 번 설정하기

현재 스크립트는 Python 3를 사용하는 Linux/macOS용이다. 이 저장소의 개발 환경은 Linux다.
외부 Python 패키지는 필요하지 않으며 `python3` 명령을 사용할 수 있어야 한다.

```bash
node --version
python3 --version
npm --version
code --version
npm ci
```

작성 시 확인한 환경은 Node.js `24.13.0`, npm `11.6.2`, VS Code `1.138.0`이다.
`package.json`의 `engines.vscode`는 `^1.138.0`이므로 호환되는 VS Code가 필요하다.
Node.js 설치 버전과 VS Code 내부 Extension Host의 Node.js 버전은 서로 다를 수 있다.

CLion의 `Settings → Plugins`에서 `JavaScript and TypeScript`, `Node.js`를 설치하거나 활성화한다.
설정 검색에서 `JavaScript Runtime` 또는 `Node.js`를 찾아 프로젝트의 Node.js 실행 파일을 지정한다.
TypeScript 설정은 프로젝트의 `node_modules/typescript`를 사용한다.

`code`를 찾지 못한다면 PATH를 확인하거나 CLI 경로를 지정한다.

```bash
VSCODE_BIN=/snap/bin/code npm run dev
```

`VSCODE_BIN`에는 실행 파일 하나의 경로만 넣는다. 명령행 옵션을 함께 넣지 않는다.
의존성이나 lockfile을 변경한 뒤에는 `npm ci`를 다시 실행한다.
스크립트는 `node_modules` 폴더 유무만 검사하므로 오래되거나 불완전한 설치는 자동으로 복구하지 않는다.

## 3. 파일별 역할

사이드바는 `package.json`의 `contributes.viewsContainers.activitybar`에 등록되어 있다.
`contributes.views`가 `atlas-engine.overview` 뷰를 연결하고,
`System`이 `View.initialize()`를 호출하여 해당 ID의 TreeDataProvider를 등록한다.
현재 트리는 비어 있으므로 `contributes.viewsWelcome`의 환영 문구와 버튼을 표시한다.
항목을 추가하려면 `src/atlas/views/overview.ts`의 `getChildren()`에서 `TreeItem` 목록을 반환한다.
사이드바를 처음 열어도 확장이 활성화되며, 등록한 provider는 확장 종료 시 해제된다.
VS Code 기본 배치에서는 왼쪽에 표시되며, 사용자가 옮긴 위치는 VS Code가 기억한다.

| 파일 | 역할 |
| --- | --- |
| `src/extension.ts` | System 생성, 종료 시 정리 연결, 최초 update 호출 |
| `src/atlas/system/system.ts` | 구성 요소 소유, 등록·명령 실행·갱신·정리 제어 |
| `src/atlas/contributions.ts` | 부모 클래스를 상속한 뷰·명령·패널 인스턴스 구성 |
| `src/atlas/detail/` | 여러 구성 요소의 내부 구현. 공통 함수는 `private_helpers.ts` 하나로 관리 |
| `package.json` | 명령 ID·표시 이름, 지원 VS Code 버전, 진입점, npm 명령 |
| `esbuild.js` | TypeScript를 `dist/extension.js`로 번들링 |
| `tsconfig.json` | TypeScript 검사·테스트 컴파일 설정 |
| `scripts/dev.py` | 빌드 후 개발용 VS Code 실행, 선택적으로 디버깅 포트 개방, watch 시작 |
| `test/extension.test.ts` | VS Code 내부에서 실행하는 통합 테스트 |
| `.vscode-test.mjs` | 자동 테스트 러너 설정 |
| `.vscode/launch.json` | VS Code 자체에서 F5로 실행할 때 사용하는 설정 |

현재 `Hello World`의 명령 ID는 `atlas-engine.helloWorld`다.
새 명령은 `Command`를 상속하고 생성자에 ID와 제목을 선언한다.
`createContributions()`의 `commands`에 인스턴스를 추가하면 manifest 생성과 System 등록이 연결된다.
등록 핸들은 System이 소유하고, System 자체를 `context.subscriptions`에 넣어 종료 시 정리한다.

VS Code는 `package.json`의 `main`에 지정한 `dist/extension.js`를 로드한다.
개발 빌드는 `.map` 파일을 생성해서 CLion이 TypeScript 소스에 브레이크포인트를 연결할 수 있게 한다.
`npm run package`는 소스맵 없이 압축된 배포용 번들을 만들므로 디버깅할 때는 개발 빌드를 사용한다.

## 4. 매일 사용하는 수정·확인 순서

1. `npm run dev`를 실행한다.
2. CLion에서 `src/extension.ts` 등을 수정하고 저장한다.
3. 터미널에서 esbuild 완료와 TypeScript 오류 유무를 확인한다.
4. 실행용 VS Code에서 `Ctrl+Shift+P → Developer: Reload Window`를 실행한다.
5. `Hello World` 또는 수정한 기능을 다시 실행한다.

watch는 파일을 다시 빌드하지만 이미 실행 중인 확장의 코드를 자동으로 교체하지 않는다.
따라서 저장 후 개발 창을 Reload해야 한다. `package.json`의 명령 등록을 바꾼 경우도 마찬가지다.
watch 도중 타입 오류가 있어도 esbuild 출력은 생길 수 있으므로 TypeScript 오류도 반드시 확인한다.
ESLint는 시작할 때 검사하며, watch 중 계속 검사하지 않는다. 필요하면 `npm run lint`를 실행한다.

개발용 데이터는 Git에서 제외한 `.vscode-dev/` 아래에 저장된다.

| 폴더 | 내용 |
| --- | --- |
| `.vscode-dev/user-data` | 개발 창의 설정과 상태 |
| `.vscode-dev/extensions` | 개발 창에 별도로 설치한 확장 |
| `.vscode-dev/workspace` | 기능을 확인할 빈 작업 폴더. 테스트할 파일을 여기에 만들어도 됨 |

평소 사용하는 VS Code의 확장이 자동으로 따라오지 않는다. 개발 창에 확장을 따로 설치하면 이후에는 함께 로드될 수 있다.
설정과 창 상태는 다음 실행에도 유지된다. 스크립트는 이 폴더를 자동 삭제하지 않는다.
스크립트를 중복 실행하면 watch도 중복으로 실행되므로 기존 watch를 먼저 종료한다.

## 5. CLion에서 디버깅하기

개발 창이 이미 열려 있다면 해당 창과 기존 watch를 종료하고 다음 명령으로 다시 시작한다.
기존 프로세스가 재사용되면 새 inspector 옵션이 적용되지 않을 수 있다.

```bash
npm run dev:debug
```

CLion에서 `Run → Edit Configurations → + → Attach to Node.js/Chrome`을 추가한다.

| 항목 | 값 |
| --- | --- |
| Name | `Atlas Extension Host` |
| Host | `localhost` |
| Port | `9230` |
| Reconnect automatically | 활성화 권장 |

1. `src/atlas/commands/hello_world.ts`의 `showInformationMessage` 줄에 브레이크포인트를 건다.
2. 위 Attach 구성을 선택하고 Debug를 누른다.
3. 개발용 VS Code에서 `Hello World`를 실행한다.
4. CLion에서 멈춘 위치, 변수, 호출 스택을 확인한다.

`activate()`의 첫 실행부터 확인하려면 다음 명령을 사용한다.

```bash
npm run dev:debug:break
```

Extension Host가 시작부터 디버거를 기다린다. CLion에서 Attach한 뒤 Resume하고 명령을 실행한다.
Attach 전에는 확장이 반응하지 않는 것처럼 보일 수 있다.
Reload 후 연결이 끊어지면 Attach를 다시 실행한다.

포트가 사용 중이면 다른 포트를 선택하고 CLion 설정도 동일하게 바꾼다.

```bash
DEBUG_PORT=9231 npm run dev:debug
```

브레이크포인트가 잡히지 않으면 다음을 확인한다.

- 디버거가 개발용 Extension Host의 포트에 연결됐는가?
- `dist/extension.js`와 `dist/extension.js.map`이 생성됐는가?
- 저장·빌드 후 개발 창을 Reload했는가?
- 브레이크포인트가 있는 명령을 실제 실행했는가?
- 다른 경로의 프로젝트를 실행하고 있지는 않은가?

## 6. CLion 실행 버튼에 등록하기

`Run → Edit Configurations → + → npm`에서 다음과 같이 설정한다.

| 항목 | 값 |
| --- | --- |
| Name | `Atlas Dev` |
| package.json | 이 프로젝트 루트의 `package.json` |
| Command | `run` |
| Scripts | `dev` |
| Node runtime / Package manager | 로컬 Node.js / npm |

이 구성을 Run하면 터미널에서 `npm run dev`를 실행하는 것과 같다.
디버깅용 구성은 Scripts를 `dev:debug`로 지정하고, 별도의 Attach 구성을 Debug로 실행한다.
npm 실행 자체를 Debug하는 것과 Extension Host에 Attach하는 것은 대상 프로세스가 다르다.
watch는 계속 실행되는 작업이므로 Attach 구성의 완료 대기용 Before launch 작업으로 넣지 않는다.

터미널에서는 `python3 scripts/dev.py`로 직접 실행할 수도 있다.
기존 Shell Script 실행 구성을 사용했다면 위의 npm 실행 구성으로 변경한다.
Python 실행 구성을 사용하는 경우 인터프리터를 Python 3로,
Script path를 프로젝트의 `scripts/dev.py`로 지정한다.

## 7. 자동 테스트와 검사

```bash
# 타입 검사 + lint + 개발 번들 빌드
npm run compile

# 테스트 컴파일 + 위 검사 + 백엔드·통신·VS Code 통합 테스트
npm test
```

`npm test`는 npm의 `pretest`를 먼저 실행하고 `@vscode/test-cli`를 실행한다.
현재 설정은 stable VS Code를 내려받거나 캐시에서 찾아 테스트용 인스턴스를 연다.
처음에는 다운로드를 위한 네트워크와 시간이 필요하다. 다운로드·테스트 데이터는 `.vscode-test/`에 저장된다.
테스트용 VS Code도 `engines.vscode`의 요구 버전을 만족해야 한다.

현재 `.vscode-test.mjs`는 `out/test/**/*.test.js`를 실행한다.

| 파일 | 검증 대상 |
| --- | --- |
| `test/backend.test.ts` | 대체 UI·transport로 기본 TBB, CUDA 동의·전환, 취소·종료 처리 |
| `test/docker.test.ts` | 임시 실행 파일로 잘못된 JSON, 프로세스 종료·취소, 소유 컨테이너 정리 |
| `test/extension.test.ts` | Hello World 실행과 백엔드 명령 등록 |

통신 테스트의 대체 실행 파일은 실제 Docker 이미지 성공을 증명하지 않는다.
반면 통합 테스트는 확장을 활성화하므로 실제 환경에서 시작 백엔드 연결·이미지 다운로드가
발생할 수 있다. 현재 테스트 파일에는 총 13개 테스트가 있으며, 이 수는 실행 결과가 아니다.
알림 문구·배치와 실제 TBB/CUDA 실행은 개발 창에서 별도로 확인한다.

GUI가 없는 Linux CI에서는 Xvfb가 설치돼 있다면 다음과 같이 실행할 수 있다.

```bash
xvfb-run -a npm test
```

## 8. 경고와 오류 구분하기

다음 메시지는 deprecated API 사용 경고다. 메시지 자체가 확장 실행 실패를 의미하지는 않는다.

```text
[DEP0169] DeprecationWarning: url.parse() ...
[DEP0040] DeprecationWarning: The punycode module is deprecated ...
```

자신의 코드, 의존성, 다른 확장 등 어느 코드에서 발생했는지는 스택 없이 확정할 수 없다.
`extHost…consoleForwarder.ts:31`은 콘솔 로그를 전달한 위치일 수 있으므로 원인 코드라고 단정하지 않는다.
별도 개발 프로필에서도 경고가 발생하면 Extension Host 로그와 경고 스택을 확인해 발생 패키지를 좁힌다.
추적이 필요할 때는 경고에 안내된 `--trace-deprecation`을 실제 경고를 내는 Node.js 프로세스에 적용해야 한다.
`npm run watch`에만 적용해서는 별도 프로세스인 Extension Host의 경고를 추적할 수 없다.

개발용 VS Code의 `Output` 패널에서 `Log (Extension Host)`를 선택하거나
`Developer: Toggle Developer Tools`의 Console을 확인한다.
현재 이 프로젝트의 활성화 로그는 다음과 같다.

```text
Congratulations, your extension "atlas-engine" is now active!
```

`Extension activated!`만으로는 어떤 확장의 메시지인지 알 수 없다.
현재 `activationEvents`에는 `onStartupFinished`가 있다. 시작 완료 시 자동 활성화되며,
그 전에 기여된 명령이나 뷰를 사용하면 더 일찍 활성화될 수 있다.
활성화 로그는 확장 초기화 완료를 뜻하며, 비동기로 진행되는 Docker 연결 성공까지 뜻하지는 않는다.

| 증상 | 확인할 내용 |
| --- | --- |
| `Hello World`가 안 보임 | 개발용 창인지, 빌드 성공 여부, `engines.vscode` 버전, manifest의 명령 등록 |
| 수정 전 알림이 계속 나옴 | 저장 → 빌드 완료 → 개발 창 Reload 순서 |
| `Cannot find module 'vscode'` | 확장을 일반 Node.js로 실행했는지 확인. 개발용 VS Code로 실행 |
| `code: command not found` | `VSCODE_BIN` 또는 PATH 설정 |
| `Cannot find module ...` 등 빌드 의존성 오류 | 프로젝트 루트에서 `npm ci` 후 재시도 |
| 테스트 다운로드 실패 | 네트워크·프록시와 테스트 러너 로그 확인 |
| 테스트가 display 오류로 종료 | 데스크톱 세션 또는 Xvfb 사용 |

## 9. 명령 요약

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 검사·빌드 + 개발 창 + 자동 재빌드 |
| `npm run dev:debug` | 위 작업 + inspector 포트 9230 |
| `npm run dev:debug:break` | 시작부터 디버거를 기다림 |
| `npm run dev -- --no-watch` | 한 번 빌드하고 개발 창만 실행 |
| `npm run dev -- --help` | 실행 스크립트 옵션 |
| `npm run watch` | 창을 열지 않고 자동 빌드·타입 검사만 실행 |
| `npm run compile` | 타입 검사·lint·개발 빌드 |
| `npm test` | 백엔드·통신·VS Code 통합 테스트 |
| `npm run manifest` | JSONC와 구성 객체로 package.json 재생성 |
| `npm run package` | 배포용 JavaScript 번들 생성. VSIX 생성·게시 작업은 아님 |

## 참고 문서

- [CLion Node.js 설정](https://www.jetbrains.com/help/clion/developing-node-js-applications.html)
- [CLion Attach to Node.js/Chrome](https://www.jetbrains.com/help/clion/run-debug-configuration-node-js-remote-debug.html)
- [VS Code 확장 테스트](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [VS Code 명령행 옵션](https://code.visualstudio.com/docs/configure/command-line)
- [Node.js deprecated API 목록](https://nodejs.org/api/deprecations.html)

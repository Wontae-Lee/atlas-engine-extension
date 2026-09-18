# 문서 안내

이 문서는 현재 저장소의 코드와 스크립트를 기준으로 작성했다.
예시로 제시한 Projects 뷰와 Inspector 패널은 현재 등록된 기능이 아니다.

| 목적 | 문서 |
| --- | --- |
| CLion에서 개발 창 실행·디버깅·테스트 | [개발 방법](development.md) |
| Extension Host, System, 클래스 구조 이해 | [VS Code 확장 구조](vscode.md) |
| View·Command·Panel 추가와 package.json 생성 | [클래스 등록과 manifest](manifest.md) |
| TBB/CUDA 선택·Docker 연결·검사 | [백엔드 사용 방법](backend.md) |
| 파일명·멤버명·클래스·주석 작성 규칙 | [코딩 스타일](guidelines/coding-style.md) |
| 구현된 변경 기록 | [변경 기록](CHANGELOG.md) |
| 에이전트 작업 범위와 실행 제약 | [AGENTS.md](../AGENTS.md) |

처음 개발할 때는 개발 방법으로 창을 실행한 뒤, VS Code 확장 구조와 manifest 문서를 읽는다.
새 기능은 `src/atlas/`의 클래스와 `contributions.ts`에서 관리한다.
여러 모듈의 내부 구현은 `src/atlas/detail/`에, 공통 함수는 그 안의 `private_helpers.ts`에 모은다.

문서에 적힌 빌드·테스트 명령은 개발자가 실행할 절차다.
에이전트는 명시적으로 요청받았을 때 실행하며, 과거 검증 기록과 현재 검증 결과를 구분한다.

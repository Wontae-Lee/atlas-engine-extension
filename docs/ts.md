위 코드에서 나온 **TypeScript 문법만** 따로 정리하면 이거야.

| TypeScript                          | 의미                            | Python 대응                   |
| ----------------------------------- | ----------------------------- | --------------------------- |
| `import * as vscode from 'vscode'`  | 모듈 전체를 `vscode`라는 이름으로 import | `import vscode`             |
| `import { System } from './system'` | 특정 항목만 import                 | `from system import System` |
| `export function activate(...)`     | 외부에서 쓸 수 있는 함수 선언             | `def activate(...)` + 모듈 공개 |
| `context: vscode.ExtensionContext`  | 변수 타입 지정                      | `context: ExtensionContext` |
| `const system = ...`                | 재할당하지 않을 변수                   | 일반 변수, 관례상 상수 느낌            |
| `let x = ...`                       | 재할당 가능한 변수                    | 일반 변수                       |
| `new System(...)`                   | 클래스 객체 생성                     | `System(...)`               |
| `undefined`                         | 값이 정의되지 않음                    | `None`과 비슷                  |
| `obj.property`                      | 객체 속성 접근                      | 동일                          |
| `obj.method()`                      | 객체 메서드 호출                     | 동일                          |
| `array.push(x)`                     | 배열 끝에 추가                      | `list.append(x)`            |
| `{ ... }`                           | 함수/조건/클래스 코드 블록               | 들여쓰기                        |
| `;`                                 | 문장 끝 표시                       | 보통 없음                       |
| `()`                                | 함수 인자 / 호출                    | 동일                          |
| `.`                                 | 객체 멤버 접근                      | 동일                          |

조금 더 핵심만 보면:

```ts
const system = new System(...);
```

은

```python
system = System(...)
```

와 거의 같고,

```ts
context.subscriptions.push(system);
```

은

```python
context.subscriptions.append(system)
```

과 같아.

그리고 이 부분:

```ts
export function activate(
    context: vscode.ExtensionContext
) {
}
```

은 Python 느낌으로 보면:

```python
def activate(context: ExtensionContext):
    pass
```

에 가깝다.

TypeScript에서 초반에 특히 익혀야 할 건 **`const` / `let`, `import` / `export`, `new`, `: 타입`, `{}` 블록, `async/await`** 정도야.

`system.ts`에서 나온 TypeScript 문법만 추리면 이 정도야.

| 문법                                             | 의미                                       |
| ---------------------------------------------- | ---------------------------------------- |
| `import type * as vscode from 'vscode'`        | 모듈의 **타입 정보만** import                    |
| `import { A, type B } from '...'`              | 실제 값 `A`와 타입 `B`를 함께 import              |
| `export class System`                          | 다른 파일에서 import 가능한 클래스 선언                |
| `implements vscode.Disposable`                 | 특정 인터페이스 규칙을 만족한다고 선언                    |
| `private`                                      | 클래스 내부에서만 접근 가능                          |
| `readonly`                                     | 변수 자체를 다른 값으로 재할당 불가                     |
| `private readonly x: Type`                     | private + readonly + 타입 지정               |
| `Type[]`                                       | 해당 타입의 배열                                |
| `= []`                                         | 빈 배열로 초기화                                |
| `constructor(...)`                             | 클래스 생성자                                  |
| `private readonly x: Type`를 constructor 인자에 사용 | 인자 선언 + 멤버 변수 선언 + `this.x = x`를 한 번에 처리 |
| `x?: Type`                                     | optional 값, 없어도 됨                        |
| `x: Type = defaultValue`                       | 기본값 지정                                   |
| `typeof vscode`                                | `vscode` 값 자체가 아니라 그 값의 타입               |
| `this.x`                                       | 현재 객체의 멤버 접근                             |
| `try { } catch (error) { }`                    | 예외 처리                                    |
| `throw error`                                  | 에러를 다시 던짐                                |
| `(): void`                                     | 인자 없음, 반환값 없음                            |
| `const x = ...`                                | 재할당하지 않을 변수 선언                           |
| `let x = ...`                                  | 재할당 가능한 변수 선언                            |
| `() => ...`                                    | arrow function                           |
| `x => ...`                                     | 인자 하나인 arrow function                    |
| `===`                                          | 타입까지 포함한 엄격한 비교                          |
| `!x`                                           | 논리 NOT                                   |
| `?.`                                           | 값이 존재할 때만 다음 메서드/속성 접근                   |
| `for (const x of array)`                       | 배열 순회                                    |
| `{ key: value }`                               | 객체 literal                               |
| `array.push(x)`                                | 배열에 요소 추가                                |
| `array.find(callback)`                         | 조건에 맞는 첫 요소 찾기                           |
| `async () => {}`                               | 비동기 함수                                   |
| `await promise`                                | Promise 완료 대기                            |
| `(...args: Type[])`                            | 여러 인자를 배열로 모음, rest syntax               |
| `func(...args)`                                | 배열을 여러 인자로 펼침, spread syntax             |
| `unknown`                                      | 타입을 아직 모르는 값                             |
| `unknown[]`                                    | 타입을 모르는 값들의 배열                           |
| `return`                                       | 함수 종료 / 값 반환                             |
| `void somePromise()`                           | 반환값을 의도적으로 사용하지 않음                       |
| `` `text ${value}` ``                          | template literal, Python f-string과 비슷    |
| `.catch(error => ...)`                         | Promise 에러 처리                            |
| `array.splice(0)`                              | 배열 요소 제거 후 제거된 값 반환                      |
| `.reverse()`                                   | 배열 순서 뒤집기                                |

Python과 비교해서 특히 기억하면 좋은 건 이거야.

```text
TypeScript                     Python

private x                      관례상 _x
readonly x                     직접 대응 없음
x?: Type                       Optional[Type]
x: Type                        x: Type
constructor(...)               __init__(...)
this.x                         self.x
() => ...                      lambda: ...
x => ...                       lambda x: ...
for (const x of arr)           for x in arr
===                            ==
!x                             not x
?.                             if x is not None
async / await                  async / await
...args                        *args
Type[]                         list[Type]
```

초보 단계에서는 특히 **`private`, `readonly`, `?`, `=>`, `?.`, `...args`, `async/await`** 이 7개만 익혀도 `system.ts` 읽기가 훨씬 편해져.

// VS Code Extension API 전체를 vscode라는 이름으로 불러온다.
import * as vscode from 'vscode';

// ./atlas/system/system 파일에서 System 클래스를 불러온다.
import { System } from './atlas/system/system';


// VS Code가 이 extension을 활성화할 때 자동으로 호출하는 함수
export function activate(context: vscode.ExtensionContext) {

    // System 클래스의 객체를 하나 생성한다.
    // new System(...)은 System 클래스의 constructor를 호출한다.
    //
    // 전달되는 값:
    // 1. vscode                -> VS Code API
    // 2. undefined             -> 두 번째 인자에 값 없음
    // 3. context.globalState   -> extension 전체에서 유지되는 전역 상태 저장소
    // 4. context.workspaceState-> 현재 workspace에만 저장되는 상태 저장소
    // 5. context.extensionUri  -> 현재 extension이 설치된 위치
    const system = new System(
        vscode,
        undefined,
        context.globalState,
        context.workspaceState,
        context.extensionUri
    );

    // system 객체를 VS Code의 subscriptions에 등록한다.
    //
    // 보통 System 클래스가 dispose() 메서드를 가지고 있으면,
    // extension이 종료될 때 VS Code가 system.dispose()를 자동 호출한다.
    context.subscriptions.push(system);

    // System 객체의 update() 메서드를 실행한다.
    system.update();
}


// VS Code extension이 비활성화될 때 호출될 수 있는 함수
export function deactivate() {
}
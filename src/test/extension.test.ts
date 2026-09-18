import * as assert from 'assert';

import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('Hello World command is contributed and executes successfully', async () => {
		const extension = vscode.extensions.all.find(candidate => candidate.packageJSON.name === 'atlas-engine');
		assert.ok(extension, 'Development extension must be loaded');
		assert.ok(extension.packageJSON.contributes.commands.some(
			(command: { command: string }) => command.command === 'atlas-engine.helloWorld'
		));
		await vscode.commands.executeCommand('atlas-engine.helloWorld');
		assert.ok(extension.isActive, 'Executing the command must activate the extension');
	});
});

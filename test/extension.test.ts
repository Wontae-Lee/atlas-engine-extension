import * as assert from 'assert';

import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('Activation registers the real Atlas commands', async () => {
		const extension = vscode.extensions.all.find(candidate => candidate.packageJSON.name === 'atlas-engine');
		assert.ok(extension, 'Development extension must be loaded');
		await extension.activate();
		assert.ok(extension.isActive, 'The development extension must activate');
		const commands = await vscode.commands.getCommands(true);
		for (const id of [
			'atlas-engine.backend.select', 'atlas-engine.backend.check',
			'atlas-engine.layout.show', 'atlas-engine.project.action',
			'atlas-engine.scene.open'
		]) {
			assert.ok(extension.packageJSON.contributes.commands.some(
				(command: { command: string }) => command.command === id
			), `${id} must be contributed`);
			assert.ok(commands.includes(id), `${id} must be registered`);
		}
		assert.ok(!commands.includes('atlas-engine.helloWorld'));
		assert.ok(!commands.includes('atlas-engine.results.open'));
	});
});

export class DockerError extends Error {
	constructor(message: string, readonly stderr: string) {
		super(message);
	}
}

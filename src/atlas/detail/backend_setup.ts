import type {BackendMode, BackendTransport} from '../backend/backend_types';
import type {BackendUi} from './backend_ui';

export class BackendSetup {
    constructor(
        private readonly transport: BackendTransport,
        private readonly ui: BackendUi
    ) {
    }

    async prepare(mode: BackendMode, signal: AbortSignal, report: (message: string) => void): Promise<boolean> {
        report('Checking Docker');
        await this.transport.check_docker(signal);
        if (mode === 'tbb') {
            if (!await this.transport.has_image('tbb', signal)) {
                report('Downloading TBB');
                await this.transport.pull('tbb', text => this.ui.log(text), signal);
            }
            return true;
        }

        if (!await this.transport.has_image('tbb', signal)) {
            report('Downloading the TBB image for the GPU check');
            await this.transport.pull('tbb', text => this.ui.log(text), signal);
        }
        report('Checking NVIDIA GPU access through Docker');
        const hardware = await this.transport.check_cuda(signal);
        signal.throwIfAborted();
        if (await this.transport.has_image('cuda', signal)) {
            return true;
        }
        if (!await this.ui.confirm_cuda(hardware)) {
            return false;
        }
        signal.throwIfAborted();
        report('Downloading CUDA');
        await this.transport.pull('cuda', text => this.ui.log(text), signal);
        return true;
    }
}

import BaseAudioContext from './BaseAudioContext';
import { AudioContextOptions } from '../types';
export default class AudioContext extends BaseAudioContext {
    constructor(options?: AudioContextOptions);
    close(): Promise<undefined>;
    resume(): Promise<undefined>;
    suspend(): Promise<undefined>;
}
//# sourceMappingURL=AudioContext.d.ts.map
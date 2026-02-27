import { IAudioBufferSourceNode } from '../interfaces';
import AudioScheduledSourceNode from './AudioScheduledSourceNode';
import BaseAudioContext from './BaseAudioContext';
import AudioBuffer from './AudioBuffer';
import AudioParam from './AudioParam';
export default class AudioBufferSourceNode extends AudioScheduledSourceNode {
    readonly playbackRate: AudioParam;
    readonly detune: AudioParam;
    constructor(context: BaseAudioContext, node: IAudioBufferSourceNode);
    get buffer(): AudioBuffer | null;
    set buffer(buffer: AudioBuffer | null);
    get loop(): boolean;
    set loop(value: boolean);
    get loopStart(): number;
    set loopStart(value: number);
    get loopEnd(): number;
    set loopEnd(value: number);
    start(when?: number, offset?: number, duration?: number): void;
}
//# sourceMappingURL=AudioBufferSourceNode.d.ts.map
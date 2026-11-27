class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.phase = 0;
    this.samples = new Int16Array(1600);
    this.sampleCount = 0;
    this.port.onmessage = (event) => {
      if (event.data === "pause") this.enabled = false;
      if (event.data === "resume") this.enabled = true;
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (output) {
      for (const channel of output) channel.fill(0);
    }

    if (!this.enabled || !inputs[0] || inputs[0].length === 0) return true;

    const channels = inputs[0];
    const frameCount = channels[0].length;
    for (let frame = 0; frame < frameCount; frame += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[frame] ?? 0;
      sample /= channels.length;

      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const clipped = Math.max(-1, Math.min(1, sample));
        this.samples[this.sampleCount] =
          clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
        this.sampleCount += 1;
      }

      if (this.sampleCount === this.samples.length) {
        const chunk = this.samples;
        this.samples = new Int16Array(1600);
        this.sampleCount = 0;
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);

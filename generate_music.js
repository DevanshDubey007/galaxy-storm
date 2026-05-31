const fs = require('fs');

const sampleRate = 44100;
const duration = 16;
const numSamples = sampleRate * duration;
const buffer = new Float32Array(numSamples);

// Space action 16-step sequencer
const notes = [261.63, 311.13, 392.00, 311.13, 261.63, 392.00, 466.16, 392.00];
const bass = [65.41, 65.41, 77.78, 77.78, 87.31, 87.31, 98.00, 98.00];

for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    
    // Melody (Square wave)
    const step = Math.floor(t * 8) % notes.length;
    const freq = notes[step] * 2;
    const melody = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.15 * Math.exp(-4 * (t % 0.125));
    
    // Bass (Square wave)
    const bstep = Math.floor(t * 4) % bass.length;
    const bfreq = bass[bstep];
    const bassline = Math.sign(Math.sin(2 * Math.PI * bfreq * t)) * 0.2 * Math.exp(-2 * (t % 0.25));
    
    // Drums (Noise snare)
    const drumEnv = Math.exp(-15 * (t % 0.5));
    const noise = (Math.random() * 2 - 1) * 0.2 * drumEnv * (Math.floor(t * 2) % 2 !== 0 ? 1 : 0);
    
    // Kick (Sine sweep)
    const kickEnv = Math.exp(-20 * (t % 0.5));
    const kickFreq = 150 * kickEnv + 40;
    const kick = Math.sin(2 * Math.PI * kickFreq * t) * 0.4 * kickEnv * (Math.floor(t * 2) % 2 === 0 ? 1 : 0);

    // Arp (Sawtooth)
    const arpFreq = notes[(Math.floor(t * 16) % notes.length)] * 4;
    const arp = (2 * (t * arpFreq - Math.floor(t * arpFreq + 0.5))) * 0.05;

    buffer[i] = melody + bassline + noise + kick + arp;
}

// Convert to 16-bit PCM WAV
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + numSamples * 2, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // 1 channel
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(numSamples * 2, 40);

const pcm = Buffer.alloc(numSamples * 2);
for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, buffer[i]));
    pcm.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, i * 2);
}

fs.writeFileSync('bgm.wav', Buffer.concat([header, pcm]));
console.log('Music generated successfully: bgm.wav');

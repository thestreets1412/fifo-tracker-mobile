import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { dictionary, translations } from '@zxcvbn-ts/language-en';
import { dictionary as commonDictionary, adjacencyGraphs } from '@zxcvbn-ts/language-common';

const estimator = new ZxcvbnFactory({ dictionary: { ...commonDictionary, ...dictionary }, translations, graphs: adjacencyGraphs });
export interface PasswordAssessment { score: number; error?: string }
export function assessPassword(password: string, pin?: string): PasswordAssessment {
  if (!/^[\x20-\x7e]{12,128}$/.test(password)) return { score: 0, error: 'ใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์ ASCII 12–128 ตัว' };
  if (pin && password.includes(pin)) return { score: 0, error: 'รหัสผ่านสำรองต้องไม่มี PIN อยู่ภายใน' };
  const lower = password.toLowerCase();
  const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  if (/(.)\1{3}/.test(lower) || sequences.some(s => [s, [...s].reverse().join('')].some(seq => {
    for (let i = 0; i <= seq.length - 4; i++) if (lower.includes(seq.slice(i, i + 4))) return true;
    return false;
  }))) return { score: 0, error: 'หลีกเลี่ยงตัวอักษรซ้ำหรือลำดับที่เดาง่าย เช่น aaaa, 1234, qwerty' };
  const score = estimator.check(password).score;
  return { score, error: score < 3 ? 'รหัสผ่านยังเดาง่าย ลองใช้คำหลายคำที่ไม่เกี่ยวข้องกัน' : undefined };
}

const words = [...new Set(dictionary['wikipedia-en'].filter(w => /^[a-z]{4,9}$/.test(w)))];
export function generatePassphrase(random: (a: Uint32Array) => Uint32Array): string {
  const limit = Math.floor(0x100000000 / words.length) * words.length;
  for (let attempt = 0; attempt < 40; attempt++) {
    const selected: string[] = [];
    while (selected.length < 5) {
      const n = random(new Uint32Array(1))[0]!;
      if (n < limit) selected.push(words[n % words.length]!);
    }
    const phrase = selected.join(' ');
    if (!assessPassword(phrase).error) return phrase;
  }
  throw new Error('Passphrase generation failed');
}

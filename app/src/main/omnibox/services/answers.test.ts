import { describe, expect, it } from 'vitest'
import { answers } from './answers'

const NOW = Date.UTC(2026, 9, 9, 6, 0, 0) // 2026-10-09T06:00:00Z
const ctx = { now: NOW, uuid: () => '11111111-2222-4333-8444-555555555555' }
const one = (query: string): ReturnType<typeof answers>[number] | undefined =>
  answers(query, ctx)[0]

describe('その場の答え（F10）', () => {
  describe('Unix 時刻と日時', () => {
    it('10 桁は秒、13 桁はミリ秒として、日時（UTC）にする', () => {
      expect(one('1700000000')).toEqual({ kind: 'unix-to-date', value: '2023-11-14T22:13:20.000Z' })
      expect(one('1700000000123')).toEqual({
        kind: 'unix-to-date',
        value: '2023-11-14T22:13:20.123Z'
      })
    })
    it('日時は Unix 時刻（秒）にする。時差がなければ UTC', () => {
      expect(one('2023-11-14T22:13:20Z')).toEqual({ kind: 'date-to-unix', value: '1700000000' })
      expect(one('2023-11-14 22:13:20')).toEqual({ kind: 'date-to-unix', value: '1700000000' })
      expect(one('2023-11-15T07:13:20+09:00')).toEqual({
        kind: 'date-to-unix',
        value: '1700000000'
      })
      expect(one('2023-11-14')).toEqual({ kind: 'date-to-unix', value: '1699920000' })
    })
    it('存在しない日付は答えない（日付は四則演算にもしない）', () => {
      expect(answers('2023-13-45', ctx)).toEqual([])
      expect(answers('2023-02-30', ctx)).toEqual([])
    })
    it('now で今の Unix 時刻', () => {
      expect(one('now')).toEqual({ kind: 'unix-now', value: String(NOW / 1000) })
    })
    it('桁が違う数字は答えない（5173 はポート、12 桁は中途半端）', () => {
      expect(answers('5173', ctx)).toEqual([])
      expect(answers('170000000012', ctx)).toEqual([])
    })
  })

  describe('四則演算', () => {
    it.each([
      ['1+2', '3'],
      ['2 * (3 + 4)', '14'],
      ['10 / 4', '2.5'],
      ['7 % 4', '3'],
      ['2 ^ 10', '1024'],
      ['2 ^ 3 ^ 2', '512'], // 右から
      ['-3 + 5', '2'],
      ['0.1 + 0.2', '0.3'], // 浮動小数点の誤差を丸める
      ['1,000 + 1', undefined] // 桁区切りは使わない
    ])('%s → %s', (query, expected) => {
      expect(one(query)?.value).toBe(expected)
    })
    it('演算子のない数字・かっこだけ・0 で割る・壊れた式・IP アドレスは答えない', () => {
      for (const q of ['5', '(5)', '1/0', '1+', '(1+2', '1++', '192.168.0.1', '', '   ']) {
        expect(answers(q, ctx), q).toEqual([])
      }
    })
    it('深すぎるかっこや長すぎる式で止まらない', () => {
      expect(answers('('.repeat(5000) + '1' + ')'.repeat(5000), ctx)).toEqual([])
      expect(answers('1+'.repeat(5000) + '1', ctx)).toEqual([])
    })
  })

  describe('色', () => {
    it('#rgb と #rrggbb は、小文字の #rrggbb と rgb() にする', () => {
      expect(one('#F80')).toEqual({
        kind: 'color',
        value: '#ff8800',
        detail: 'rgb(255, 136, 0)',
        color: '#ff8800'
      })
      expect(one('#0A1B2C')).toMatchObject({ value: '#0a1b2c', detail: 'rgb(10, 27, 44)' })
    })
    it('rgb(r, g, b) は #rrggbb にする。範囲外は答えない', () => {
      expect(one('rgb(255, 0, 128)')).toMatchObject({ value: '#ff0080', color: '#ff0080' })
      expect(answers('rgb(256, 0, 0)', ctx)).toEqual([])
      expect(answers('#12', ctx)).toEqual([])
      expect(answers('#ggg', ctx)).toEqual([])
    })
  })

  describe('Base64 と URL エンコード', () => {
    it('base64 / b64 で符号化、base64d / b64d で復号（UTF-8）', () => {
      expect(one('base64 hello')).toEqual({ kind: 'base64-encode', value: 'aGVsbG8=' })
      expect(one('b64 こんにちは')).toEqual({
        kind: 'base64-encode',
        value: '44GT44KT44Gr44Gh44Gv'
      })
      expect(one('base64d aGVsbG8=')).toEqual({ kind: 'base64-decode', value: 'hello' })
      expect(one('b64d 44GT44KT44Gr44Gh44Gv')).toMatchObject({ value: 'こんにちは' })
      expect(one('b64d aGVsbG8')).toMatchObject({ value: 'hello' }) // = がなくてもよい
      expect(one('b64d aGVsbG8_Pw')).toMatchObject({ value: 'hello??' }) // URL 用の文字（- と _）
    })
    it('復号できない・UTF-8 でないものは答えない', () => {
      expect(answers('b64d !!!', ctx)).toEqual([])
      expect(answers('b64d /w==', ctx)).toEqual([]) // 0xFF だけ（UTF-8 ではない）
    })
    it('urlencode / urle と urldecode / urld', () => {
      expect(one('urlencode a b&c=日本')).toEqual({
        kind: 'url-encode',
        value: 'a%20b%26c%3D%E6%97%A5%E6%9C%AC'
      })
      expect(one('urld a%20b%26c')).toEqual({ kind: 'url-decode', value: 'a b&c' })
      expect(answers('urld %E3%81', ctx)).toEqual([]) // 壊れた符号
    })
    it('引数がなければ答えない', () => {
      expect(answers('base64', ctx)).toEqual([])
      expect(answers('urlencode   ', ctx)).toEqual([])
    })
  })

  describe('UUID', () => {
    it('uuid で新しい UUID（v4）を出す', () => {
      expect(one('uuid')).toEqual({ kind: 'uuid', value: ctx.uuid() })
      expect(one('UUID')).toBeDefined()
    })
    it('既定の生成は v4 の形', () => {
      const value = answers('uuid', { now: NOW })[0]?.value
      expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
  })

  it('ふつうの検索語には答えない', () => {
    for (const q of ['react hooks', 'example.com', 'uuid generator', 'now playing', 'github']) {
      expect(answers(q, ctx), q).toEqual([])
    }
  })
})

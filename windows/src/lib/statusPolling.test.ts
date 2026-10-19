import { afterEach, expect, it, vi } from 'vitest'
import { startStatusPolling } from './statusPolling'

let stop: (() => void) | undefined
afterEach(() => { stop?.(); vi.useRealTimers(); vi.restoreAllMocks() })

it('slows hidden polling and refreshes immediately on visibility without overlapping requests', async () => {
  vi.useFakeTimers()
  let hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  const sample = vi.fn(async () => {})
  stop = startStatusPolling(sample)
  await vi.advanceTimersByTimeAsync(1000)
  expect(sample).toHaveBeenCalledTimes(2)
  hidden = true
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(9999)
  expect(sample).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(sample).toHaveBeenCalledTimes(3)
  hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(0)
  expect(sample).toHaveBeenCalledTimes(4)
  stop()
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(20000)
  expect(sample).toHaveBeenCalledTimes(4)
})

it('visibility changes never overlap a pending sample and stop removes future polling', async () => {
  vi.useFakeTimers()
  let resolve!: () => void
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const sample = vi.fn(() => new Promise<void>(r => { resolve = r }))
  stop = startStatusPolling(sample)
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(20000)
  expect(sample).toHaveBeenCalledTimes(1)
  stop()
  resolve()
  await vi.advanceTimersByTimeAsync(20000)
  expect(sample).toHaveBeenCalledTimes(1)
})

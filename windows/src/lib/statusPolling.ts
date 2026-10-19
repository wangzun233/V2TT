export function startStatusPolling(sample: () => Promise<void>, source: Document = document) {
  let stopped = false
  let busy = false
  let refreshPending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const interval = () => source.hidden ? 10000 : 1000
  const schedule = (delay: number) => { clearTimeout(timer); timer = setTimeout(() => void tick(), delay) }
  async function tick() {
    if (stopped || busy) return
    busy = true
    try { await sample() }
    finally {
      busy = false
      if (!stopped) schedule(refreshPending ? 0 : interval())
      refreshPending = false
    }
  }
  const onVisibility = () => {
    clearTimeout(timer)
    refreshPending = !source.hidden && busy
    if (!busy) schedule(source.hidden ? interval() : 0)
  }
  source.addEventListener('visibilitychange', onVisibility)
  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
    source.removeEventListener('visibilitychange', onVisibility)
  }
}

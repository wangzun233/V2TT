(() => {
  const screen = document.querySelector('[data-startup-screen]')
  if (!screen) return
  const fail = () => {
    if (!screen.isConnected) return
    screen.dataset.failed = 'true'
    screen.querySelector('[data-startup-title]').textContent = '界面加载失败'
    screen.querySelector('[data-startup-detail]').textContent = '界面资源未能正常启动。重新加载不会删除订阅或修改代理设置。'
    screen.querySelector('[data-startup-reload]').hidden = false
  }
  const onError = (event) => {
    if (event.target?.tagName === 'SCRIPT' || event instanceof ErrorEvent) fail()
  }
  screen.querySelector('[data-startup-reload]').addEventListener('click', () => location.reload())
  window.addEventListener('error', onError, true)
  const timer = setTimeout(fail, 12000)
  const observer = new MutationObserver(() => {
    if (screen.isConnected) return
    clearTimeout(timer)
    window.removeEventListener('error', onError, true)
    observer.disconnect()
  })
  observer.observe(document.getElementById('root'), { childList: true })
})()

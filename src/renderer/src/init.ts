import './utils/analytics'

import KeyvStorage from '@kangfenmao/keyv-storage'

import { startAutoSync } from './services/BackupService'
import store from './store'

function initSpinner() {
  const spinner = document.getElementById('spinner')
  if (spinner && window.location.hash !== '#/mini') {
    spinner.style.display = 'flex'
  }
}

function initKeyv() {
  window.keyv = new KeyvStorage()
  window.keyv.init()
}

function initAutoSync() {
  setTimeout(() => {
    // 检查WebDAV自动备份设置
    const { webdavAutoSync } = store.getState().settings
    if (webdavAutoSync) {
      startAutoSync()
    }

    // 检查坚果云自动备份设置
    const { nutstoreAutoSync, nutstoreSyncInterval } = store.getState().nutstore
    if (nutstoreAutoSync && nutstoreSyncInterval > 0) {
      // 导入并启动坚果云自动备份
      import('./services/NutstoreService').then(({ startNutstoreAutoSync }) => {
        console.log('[Init] Starting Nutstore auto sync based on saved settings')
        startNutstoreAutoSync()
      })
    } else {
      // 确保坚果云自动备份已停止
      import('./services/NutstoreService').then(({ stopNutstoreAutoSync }) => {
        console.log('[Init] Ensuring Nutstore auto sync is stopped')
        stopNutstoreAutoSync()
      })
    }
  }, 2000)
}

initSpinner()
initKeyv()
initAutoSync()

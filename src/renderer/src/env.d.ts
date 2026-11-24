import type { CodeMapApi } from '../../shared/types'

declare global {
  interface Window {
    api: CodeMapApi
  }
}
export {}

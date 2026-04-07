import { toast as sonnerToast } from 'sonner'

const DURATION_OK = 4000
const DURATION_ERR = 6000

export const adminToast = {
  success(message: string, description?: string) {
    return sonnerToast.success(message, {
      description,
      duration: DURATION_OK,
    })
  },
  error(message: string, description?: string) {
    return sonnerToast.error(message, {
      description,
      duration: DURATION_ERR,
    })
  },
  warning(message: string, description?: string) {
    return sonnerToast.warning(message, {
      description,
      duration: DURATION_OK,
    })
  },
  info(message: string, description?: string) {
    return sonnerToast.info(message, {
      description,
      duration: DURATION_OK,
    })
  },
}

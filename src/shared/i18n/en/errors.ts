import type { errors as ko } from '../ko/errors'

export const errors: typeof ko = {
  notFound: "That file or folder doesn't exist. Check whether it was moved or deleted",
  noPermission: "You don't have permission to write to that folder. Choose another location",
  diskFull: 'Your computer is out of storage space',
  busy: 'Another program is using that file. Close it and try again',
  offline: "Couldn't connect to the internet. Check your connection and try again",
  searchFailed: "Couldn't search"
}

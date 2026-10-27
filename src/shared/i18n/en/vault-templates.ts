import type { vaultTemplates as ko } from '../ko/vault-templates'

export const vaultTemplates: typeof ko = {
  research: { name: 'Research', description: 'Pose questions and build up methods and findings' },
  reading: { name: 'Reading', description: 'Collect themes and quotes from books and articles' },
  work: {
    name: 'Work',
    description: 'Keep projects, meetings and decisions together with team context'
  }
}

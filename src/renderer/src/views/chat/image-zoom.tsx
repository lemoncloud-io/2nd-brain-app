// 채팅 그림 크게 보기 — 작은 그림을 누르면 화면 가운데에 원래 크기(화면에 맞춰)로 띄운다.
// 바깥·그림을 누르거나 Esc 로 닫는다
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { useT } from '../../lib/i18n'

export const ImageZoom = ({
  src,
  alt,
  testId,
  children
}: {
  src: string
  alt: string
  testId: string
  /** 누를 작은 그림 */
  children: React.ReactNode
}): React.JSX.Element => {
  const t = useT()
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={t.chatView.images.zoom(alt)}
          data-testid={testId}
          className="focus-ring block cursor-zoom-in rounded-lg"
        >
          {children}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.6)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          data-testid="chat-image-zoom"
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex items-center justify-center p-8 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <Dialog.Close asChild>
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain shadow-overlay"
            />
          </Dialog.Close>
          <Dialog.Close
            aria-label={t.chatView.images.close}
            data-testid="chat-image-zoom-close"
            className="focus-ring absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full bg-elevated text-muted-foreground shadow-raised hover:text-foreground"
          >
            <X aria-hidden className="size-4" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

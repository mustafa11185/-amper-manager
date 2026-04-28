import BottomNav from '@/components/BottomNav'
import TopBar from '@/components/TopBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[390px] min-h-dvh bg-bg-base relative">
      <main className="pb-20 px-4 pt-2">
        <TopBar />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

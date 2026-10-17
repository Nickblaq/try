import HierarchicalMemoryDemo from "@/components/HierarchicalMemoryDemo";
import MemoryRunPanel from "@/components/MemoryRunPanel";
export const metadata = {
  title: "Hierarchical Memory Demo",
  description: "Interactive demo of hierarchical memory",
};

export default function Hmd() {
  return (
    <main >
      <MemoryRunPanel />
    </main>
  );
}

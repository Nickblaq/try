import HierarchicalMemoryDemo from "@/components/HierarchicalMemoryDemo";
import MemoryRubPanel from "@/components/MemoryRubPanel";
export const metadata = {
  title: "Hierarchical Memory Demo",
  description: "Interactive demo of hierarchical memory",
};

export default function Hmd() {
  return (
    <main >
      <MemoryRubPanel />
    </main>
  );
}

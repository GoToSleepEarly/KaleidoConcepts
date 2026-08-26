import { ProtectedLayout } from "@/components/protected-layout";
import { GrammarKnowledgeLibrary } from "@/features/grammar/components/grammar-knowledge-library";

export default function GrammarPage() {
  return (
    <ProtectedLayout>
      <GrammarKnowledgeLibrary />
    </ProtectedLayout>
  );
}

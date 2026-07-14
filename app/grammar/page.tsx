import { ProtectedLayout } from "@/components/protected-layout";
import { PresetLibrary } from "@/features/presets/components/preset-library";

export default function GrammarPage() {
  return (
    <ProtectedLayout>
      <PresetLibrary kind="grammar" />
    </ProtectedLayout>
  );
}

import { ProtectedLayout } from "@/components/protected-layout";
import { PresetLibrary } from "@/features/presets/components/preset-library";

export default function ThemesPage() {
  return (
    <ProtectedLayout>
      <PresetLibrary kind="theme" />
    </ProtectedLayout>
  );
}

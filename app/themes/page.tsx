import { ProtectedLayout } from "@/components/protected-layout";
import { ThemePresetLibrary } from "@/features/presets/components/preset-library";

export default function ThemesPage() {
  return (
    <ProtectedLayout>
      <ThemePresetLibrary />
    </ProtectedLayout>
  );
}

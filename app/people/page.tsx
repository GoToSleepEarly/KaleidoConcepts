import { ProtectedLayout } from "@/components/protected-layout";
import { PeopleManager } from "@/features/people/components/people-manager";

export default function PeoplePage() {
  return (
    <ProtectedLayout>
      <PeopleManager />
    </ProtectedLayout>
  );
}

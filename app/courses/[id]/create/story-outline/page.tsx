import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { ProtectedLayout } from "@/components/protected-layout";
import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";

export default async function StoryOutlinePlaceholder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <CourseCreateSteps currentStep={2} />
        <section className="rounded-lg bg-card p-8 text-center shadow-sm sm:p-12">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-6" /></span>
          <h2 className="mt-5 text-xl font-semibold text-foreground">授课对象已保存</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">人物快照已经写入新系统。故事大纲是下一个独立模块，本轮没有提前实现。</p>
          <div className="mt-6 flex justify-center gap-2"><Button asChild variant="outline"><Link href={`/courses/${id}/create/audience`}><ArrowLeft className="size-4" />返回授课对象</Link></Button><Button asChild><Link href="/courses">回到课程列表</Link></Button></div>
        </section>
      </div>
    </ProtectedLayout>
  );
}

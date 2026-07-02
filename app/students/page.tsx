import { ProtectedLayout } from "@/components/protected-layout";
import { mockStudents } from "@/lib/mock-course-data";

export default function StudentsPage() {
  return (
    <ProtectedLayout>
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-950">学生列表</h2>
          <p className="mt-2 text-sm text-slate-500">当前为前端 mock 数据。</p>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">学生</th>
                <th className="px-4 py-3 font-medium">年龄</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {mockStudents.map((student) => (
                <tr className="bg-white" key={student.id}>
                  <td className="px-4 py-4 font-medium text-slate-950">{student.name}</td>
                  <td className="px-4 py-4 text-slate-600">{student.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedLayout>
  );
}

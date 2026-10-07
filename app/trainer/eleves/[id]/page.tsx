import StudentDetail from "@/components/trainer/StudentDetail"

export default function TrainerStudentPage({ params }: { params: { id: string } }) {
  return <StudentDetail id={params.id} />
}

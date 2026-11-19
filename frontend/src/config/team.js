export const DEPARTMENT = 'Department of Software Engineering, UFTB'

export const SUPERVISOR = { name: 'Md. Mahmodul Hasan' }

// এই project এর developer রা: Student ID মিললেই developer badge পাবে
export const DEVELOPERS = [
  { studentId: '2303028', name: 'Mahbub Sifat', role: 'Frontend', linkedin: 'https://www.linkedin.com/in/mahbubsifat/' },
  { studentId: '2303030', name: 'Irshad', role: 'Team Leader, DevOps', linkedin: 'https://www.linkedin.com/in/irshad-hossain/' },
  { studentId: '2403016', name: 'Mahbub Tanmay', role: 'Backend', linkedin: 'https://www.linkedin.com/in/mdmahbubtanmay/' },
  { studentId: '2403019', name: 'Ramzan', role: 'Design', linkedin: 'https://www.linkedin.com/in/md--ramzan--ali/' },
]

export const developerOf = (studentId) => DEVELOPERS.find((d) => d.studentId === String(studentId)) ?? null
export const isDeveloper = (studentId) => developerOf(studentId) !== null
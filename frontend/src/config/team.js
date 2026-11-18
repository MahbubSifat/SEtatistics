// Developer badge পাবে এই project এর যারা developer।
// এখানে তাদের Student ID (আর নাম) লিখে দাও। footer এও নাম দেখাবে।
export const DEVELOPERS = [
  // { studentId: '2303001', name: 'Full Name' },
]

export const isDeveloper = (studentId) =>
  DEVELOPERS.some((d) => d.studentId === String(studentId))
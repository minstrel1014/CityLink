export type GroupStatus = "open" | "considering" | "full";
export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled";
export interface Course {
  id: string;
  code: string;
  title: string;
  department: string;
  credits: number;
  semester: string;
  description: string;
  color: string;
}
export interface Student {
  id: string;
  studentId: string;
  name: string;
  major: string;
  year: number;
  bio: string;
  skills: string[];
  status: GroupStatus;
  avatar: string;
  color: string;
}
export interface Enrolment {
  studentId: string;
  courseId: string;
}
export interface Invitation {
  id: string;
  senderId: string;
  recipientId: string;
  courseId: string;
  status: InvitationStatus;
  createdAt: string;
}
export const DEMO_USER_ID = "stu01";
export const sampleCourses: Course[] = [
  {
    id: "is3100",
    code: "IS3100",
    title: "Business Application Development",
    department: "Information Systems",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Turn business ideas into useful applications. Work together to design, build and present a working prototype.",
    color: "sage",
  },
  {
    id: "is2200",
    code: "IS2200",
    title: "Business Programming",
    department: "Information Systems",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Build a foundation in programming and solve practical business problems with Python.",
    color: "peach",
  },
  {
    id: "cb2500",
    code: "CB2500",
    title: "Information Management",
    department: "Business",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Explore how organisations manage information, digital processes and business systems.",
    color: "lavender",
  },
  {
    id: "is3230",
    code: "IS3230",
    title: "Systems Analysis & Design",
    department: "Information Systems",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Understand users, model business processes and design thoughtful information systems.",
    color: "blue",
  },
  {
    id: "cb2300",
    code: "CB2300",
    title: "Business Statistics",
    department: "Business",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Use data and statistical reasoning to make informed business decisions.",
    color: "yellow",
  },
  {
    id: "is3300",
    code: "IS3300",
    title: "Database Management",
    department: "Information Systems",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Design relational databases and learn to query real-world datasets with SQL.",
    color: "pink",
  },
  {
    id: "mkt3600",
    code: "MKT3600",
    title: "Digital Marketing",
    department: "Marketing",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Create a collaborative digital campaign with audience research and measurable goals.",
    color: "peach",
  },
  {
    id: "cs2300",
    code: "CS2300",
    title: "Data Structures",
    department: "Computer Science",
    credits: 3,
    semester: "Semester A · 2026/27",
    description:
      "Learn the structures and algorithms behind efficient software.",
    color: "blue",
  },
];
export const sampleStudents: Student[] = [
  {
    id: "stu01",
    studentId: "DEMO10001",
    name: "Alex Wong",
    major: "Information Systems",
    year: 3,
    bio: "An IS student who enjoys turning everyday problems into thoughtful digital experiences. Looking for a team that communicates openly and likes to build things.",
    skills: ["UI/UX design", "Python", "Project planning"],
    status: "open",
    avatar: "AW",
    color: "sage",
  },
  {
    id: "stu02",
    studentId: "DEMO10002",
    name: "Chloe Chan",
    major: "Information Systems",
    year: 3,
    bio: "I love the space where technology meets people. I usually take the lead on user research and interface design. Happy to brainstorm over coffee and keep our project moving.",
    skills: ["Figma", "User research", "HTML & CSS"],
    status: "open",
    avatar: "CC",
    color: "peach",
  },
  {
    id: "stu03",
    studentId: "DEMO10003",
    name: "Ethan Lee",
    major: "Computer Science",
    year: 2,
    bio: "Curious developer with a soft spot for clean code. I enjoy prototyping, solving tricky problems and learning from teammates with different perspectives.",
    skills: ["React", "TypeScript", "Python"],
    status: "open",
    avatar: "EL",
    color: "blue",
  },
  {
    id: "stu04",
    studentId: "DEMO10004",
    name: "Sophie Lam",
    major: "Information Systems",
    year: 3,
    bio: "I bring structure to group projects: clear milestones, shared notes and a little encouragement. Interested in business analytics and data storytelling.",
    skills: ["SQL", "Data analysis", "Presentation"],
    status: "considering",
    avatar: "SL",
    color: "lavender",
  },
  {
    id: "stu05",
    studentId: "DEMO10005",
    name: "Ryan Cheung",
    major: "Business Administration",
    year: 2,
    bio: "An ideas person who also likes getting things done. Interested in product strategy and market research. Available for afternoon project meetings.",
    skills: ["Market research", "Excel", "Copywriting"],
    status: "open",
    avatar: "RC",
    color: "yellow",
  },
  {
    id: "stu06",
    studentId: "DEMO10006",
    name: "Natalie Ho",
    major: "Information Systems",
    year: 3,
    bio: "I enjoy organising information and making complicated things simple. Currently exploring database design and collaborative development.",
    skills: ["SQL", "ER modelling", "Git"],
    status: "open",
    avatar: "NH",
    color: "pink",
  },
  {
    id: "stu07",
    studentId: "DEMO10007",
    name: "Jason Ng",
    major: "Computer Science",
    year: 3,
    bio: "Backend enthusiast and reliable debugging partner. My group is already formed for this semester, but I am always happy to meet fellow builders.",
    skills: ["Java", "APIs", "Database design"],
    status: "full",
    avatar: "JN",
    color: "blue",
  },
  {
    id: "stu08",
    studentId: "DEMO10008",
    name: "Emily Tsang",
    major: "Marketing",
    year: 2,
    bio: "Creative thinker with an eye for detail. I enjoy developing campaigns and telling stories through visuals, backed up by solid research.",
    skills: ["Content strategy", "Canva", "Research"],
    status: "open",
    avatar: "ET",
    color: "peach",
  },
  {
    id: "stu09",
    studentId: "DEMO10009",
    name: "Daniel Liu",
    major: "Information Systems",
    year: 2,
    bio: "Learning by building. I enjoy Python, business process mapping and working in teams where everyone contributes a different strength.",
    skills: ["Python", "Process mapping", "Excel"],
    status: "considering",
    avatar: "DL",
    color: "sage",
  },
  {
    id: "stu10",
    studentId: "DEMO10010",
    name: "Grace Yip",
    major: "Business Administration",
    year: 3,
    bio: "I like connecting the big picture to the details. Comfortable presenting and coordinating tasks, and always keen to learn a new tool.",
    skills: ["Presentation", "Project planning", "Statistics"],
    status: "open",
    avatar: "GY",
    color: "lavender",
  },
  {
    id: "stu11",
    studentId: "DEMO10011",
    name: "Marcus Chan",
    major: "Computer Science",
    year: 2,
    bio: "A hands-on programmer who enjoys collaborative problem-solving. Looking for teammates who ask questions and share what they learn.",
    skills: ["Python", "JavaScript", "Testing"],
    status: "open",
    avatar: "MC",
    color: "yellow",
  },
  {
    id: "stu12",
    studentId: "DEMO10012",
    name: "Olivia Cheng",
    major: "Information Systems",
    year: 3,
    bio: "I care about accessible design and useful products. My team is complete for this term, and we are working on a student wellbeing project.",
    skills: ["Accessibility", "Figma", "Research"],
    status: "full",
    avatar: "OC",
    color: "pink",
  },
];
const courseRoster: Record<string, string[]> = {
  is3100: ["stu01", "stu02", "stu03", "stu04", "stu06", "stu07", "stu12"],
  is2200: ["stu01", "stu03", "stu04", "stu09", "stu11"],
  cb2500: ["stu01", "stu02", "stu05", "stu08", "stu10"],
  is3230: ["stu01", "stu02", "stu06", "stu09", "stu12"],
  cb2300: ["stu01", "stu04", "stu05", "stu10", "stu11"],
  is3300: ["stu01", "stu03", "stu06", "stu07", "stu09"],
  mkt3600: ["stu05", "stu08", "stu10"],
  cs2300: ["stu03", "stu07", "stu11"],
};
export const sampleEnrolments: Enrolment[] = Object.entries(
  courseRoster
).flatMap(([courseId, ids]) => ids.map(studentId => ({ studentId, courseId })));
export const sampleInvitations: Invitation[] = [
  {
    id: "seed-incoming-1",
    senderId: "stu02",
    recipientId: DEMO_USER_ID,
    courseId: "is3100",
    status: "pending",
    createdAt: "2026-10-24T09:00:00Z",
  },
  {
    id: "seed-incoming-2",
    senderId: "stu05",
    recipientId: DEMO_USER_ID,
    courseId: "cb2500",
    status: "pending",
    createdAt: "2026-10-23T14:00:00Z",
  },
  {
    id: "seed-outgoing-1",
    senderId: DEMO_USER_ID,
    recipientId: "stu04",
    courseId: "is2200",
    status: "accepted",
    createdAt: "2026-10-22T10:00:00Z",
  },
];

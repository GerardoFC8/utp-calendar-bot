// ============================================================
// CSS SELECTORS for UTP+ CLASS (class.utp.edu.pe)
// ============================================================
// This platform is a custom SPA built by Xpedition.
//
// DISCOVERY (March 2026): The SPA calls api-pao.utpxpedition.com
// for ALL data. Use interceptor.ts to capture API responses.
// DOM selectors are fallback only.
//
// To discover new selectors:
//   npx playwright codegen https://class.utp.edu.pe/
// ============================================================

export const SELECTORS = {
  // === LOGIN (generic / direct) ===
  loginForm: 'form[action*="login"], #login-form',
  usernameField: 'input[name="username"], input[type="email"], #username',
  passwordField: 'input[name="password"], input[type="password"]',
  submitButton: 'button[type="submit"], #login-button',

  // Updated: after Keycloak redirect the SPA shows "Hola, {name}" greeting link
  loggedInIndicator: 'a:has-text("Hola,"), [class*="user-menu"], [class*="student"]',

  // === KEYCLOAK SSO (sso.utp.edu.pe / realms/Xpedition) ===
  kcLoginForm: '#kc-form-login',
  kcUsernameField: '#username',
  kcPasswordField: '#password',
  kcSubmitButton: '#kc-login',
  kcErrorMessage: '#input-error, .kc-feedback-text, [class*="alert-error"]',

  // === SPA NAVIGATION ===
  calendarLink: 'a[href="/student/calendar"]',
  coursesLink: 'a[href="/student/courses"]',

  // === CALENDAR (/student/calendar) ===
  // The calendar renders as an ARIA grid
  calendarContainer: '[role="grid"]',
  calendarWeekHeader: '[role="columnheader"]',
  calendarGridCell: '[role="gridcell"]',
  // Events inside gridcells are clickable containers with paragraphs:
  //   p[0]: course name + section code (e.g. "Individuo y Medio Ambiente 8144")
  //   p[1]: time range (e.g. "10:00 a.m. - 10:45 a.m.")
  //   p[2]: optional label (e.g. "Virtual en vivo")
  // NOTE: cursor:pointer is an inline style, not a class — use DOM traversal in code

  // === COURSES (/student/courses) ===
  // Course links follow pattern: /student/courses/{uuid}/section/{uuid}/learnv2
  courseCard: 'a[href*="/student/courses/"][href*="/learnv2"]',
  // Activities sidebar
  activityItem: 'a[href*="/learnv2/week/"]',

  // === COURSE DETAIL ===
  courseZoomLink: 'a[href*="zoom.us"], a[href*="zoom.com"], [class*="zoom"]',
  courseTasksList: '[class*="tasks"], [class*="assignments"], [class*="activities"]',
  courseTaskItem: '[class*="task-item"], [class*="assignment-item"]',
  courseTaskDueDate: '[class*="due-date"], [class*="deadline"]',
  courseForumLink: 'a[href*="forum"], [class*="forum"]',
} as const;

// ============================================================
// REAL API — api-pao.utpxpedition.com
// ============================================================
// All endpoints require Bearer token (passed automatically via
// the browser session cookies after Keycloak login).
//
// :userId = UUID like 9e55172f-6278-567c-86d6-8871b18fbc66
// Extract it from intercepted API call URLs — see interceptor.ts
// ============================================================

export const API_BASE = 'https://api-pao.utpxpedition.com';

export const API_ENDPOINTS = {
  // GET — returns list of academic periods for the student
  academicPeriods: '/course/student/:userId/academicperiods',

  // GET — returns courses with progress data
  dashboardCourses: '/learning/student/:userId/dashboard-courses',

  // GET — returns summary of pending activities
  pendingActivities: '/course/student/activities/pending/resume',

  // GET — returns class sessions for a week
  // Query params: userId={uuid}&dateToQuery=YYYY-MM-DD+00:00:00&intervalMode=period
  calendar: '/course/student/calendar',

  // GET — returns tasks/activities for a week
  // Query params: userId={uuid}&dateToQuery=YYYY-MM-DD+00:00:00&intervalMode=period
  calendarActivities: '/course/student/calendar/activities',

  // GET — notification count
  // Query params: period=2262,9999
  notifications: '/notification/student/notifications/total/user/:userId',

  // GET — general survey status
  survey: '/course/student/general/survey',

  // GET — returns complete course structure with all weeks, themes, contents
  // Each content has unreadComments field
  courseFull: '/course/student/courses/:courseId/sections/:sectionId/full',
} as const;

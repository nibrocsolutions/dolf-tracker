import { BrowserRouter, Route, Routes } from "react-router-dom";
import { NotFound } from "./components/NotFound";
import { Shell } from "./components/Shell";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { CourseFormPage } from "./pages/CourseFormPage";
import { CoursesPage } from "./pages/CoursesPage";
import { HomePage } from "./pages/HomePage";
import { PlayPage } from "./pages/PlayPage";
import { RoundDetailPage } from "./pages/RoundDetailPage";
import { RoundsPage } from "./pages/RoundsPage";
import { ScorePage } from "./pages/ScorePage";
import { StatsPage } from "./pages/StatsPage";
import { StoreProvider } from "./store-context";

export function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/new" element={<CourseFormPage />} />
            <Route path="/courses/:courseId" element={<CourseDetailPage />} />
            <Route path="/courses/:courseId/edit" element={<CourseFormPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/play/:roundId" element={<ScorePage />} />
            <Route path="/rounds" element={<RoundsPage />} />
            <Route path="/rounds/:roundId" element={<RoundDetailPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </StoreProvider>
  );
}

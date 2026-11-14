import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import PassengerDashboard from './pages/passenger/Dashboard';
import BookRide from './pages/passenger/BookRide';
import TrackRide from './pages/passenger/TrackRide';
import RideHistory from './pages/passenger/History';
import DriverDashboard from './pages/driver/Dashboard';
import DriverHistory from './pages/driver/History';
import AdminDashboard from './pages/admin/Dashboard';
import AdminPassengers from './pages/admin/Passengers';
import AdminDrivers from './pages/admin/Drivers';
import AdminRides from './pages/admin/Rides';
import Forecast from './pages/analytics/Forecast';
import Zones from './pages/analytics/Zones';
import Pooling from './pages/analytics/Pooling';
import Allocation from './pages/analytics/Allocation';
import AdminSafety from './pages/admin/Safety';
import ShareTrip from './pages/ShareTrip';

export const homeFor = (role) => ({ passenger: '/passenger', driver: '/driver', admin: '/admin' })[role] || '/';

function Guard({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login/:role" element={<Login />} />
      <Route path="/register/:role" element={<Register />} />
      <Route path="/share/:token" element={<ShareTrip />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route path="/passenger" element={<Guard roles={['passenger']}><PassengerDashboard /></Guard>} />
        <Route path="/passenger/book" element={<Guard roles={['passenger']}><BookRide /></Guard>} />
        <Route path="/passenger/track" element={<Guard roles={['passenger']}><TrackRide /></Guard>} />
        <Route path="/passenger/track/:id" element={<Guard roles={['passenger']}><TrackRide /></Guard>} />
        <Route path="/passenger/history" element={<Guard roles={['passenger']}><RideHistory /></Guard>} />
        <Route path="/driver" element={<Guard roles={['driver']}><DriverDashboard /></Guard>} />
        <Route path="/driver/history" element={<Guard roles={['driver']}><DriverHistory /></Guard>} />
        <Route path="/admin" element={<Guard roles={['admin']}><AdminDashboard /></Guard>} />
        <Route path="/admin/passengers" element={<Guard roles={['admin']}><AdminPassengers /></Guard>} />
        <Route path="/admin/drivers" element={<Guard roles={['admin']}><AdminDrivers /></Guard>} />
        <Route path="/admin/rides" element={<Guard roles={['admin']}><AdminRides /></Guard>} />
        <Route path="/admin/safety" element={<Guard roles={['admin']}><AdminSafety /></Guard>} />
        <Route path="/analytics/forecast" element={<Guard roles={['admin', 'driver']}><Forecast /></Guard>} />
        <Route path="/analytics/zones" element={<Guard roles={['admin', 'driver']}><Zones /></Guard>} />
        <Route path="/analytics/pooling" element={<Pooling />} />
        <Route path="/analytics/allocation" element={<Guard roles={['admin']}><Allocation /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

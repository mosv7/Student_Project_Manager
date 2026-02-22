import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

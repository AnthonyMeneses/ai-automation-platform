export default function Loading({ full = false }) {
  return (
    <div className={full ? 'loading loading-full' : 'loading'}>
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

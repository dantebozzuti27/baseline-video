export default function Loading() {
  return (
    <div className="container">
      <div className="bvSkeleton bvSkeletonHeader" />
      <div className="stack" style={{ gap: 14 }}>
        <div className="bvSkeleton bvSkeletonCard" />
        <div className="bvSkeleton bvSkeletonCard" />
        <div className="bvSkeleton bvSkeletonCard" />
      </div>
    </div>
  );
}


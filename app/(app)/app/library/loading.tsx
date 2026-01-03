export default function Loading() {
  return (
    <div className="container">
      <div className="bvSkeleton bvSkeletonHeader" />
      <div className="row" style={{ gap: 14 }}>
        <div className="bvSkeleton bvSkeletonVideoCard" />
        <div className="bvSkeleton bvSkeletonVideoCard" />
        <div className="bvSkeleton bvSkeletonVideoCard" />
      </div>
    </div>
  );
}


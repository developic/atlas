/**
 * The soft sand/sage atmosphere behind the headerless routes (`/start`,
 * `/dashboard`). Purely decorative, so it is inert to pointers and hidden from
 * assistive tech. It needs a positioned, isolated ancestor with a `-z-10`
 * stacking context — both pages wrap it in `relative isolate`.
 */
export function AmbientBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="start-blob-a absolute -top-[18rem] -right-[12rem] size-[34rem] rounded-full bg-sage-wash/80 sm:size-[42rem] dark:bg-sage/[0.06]" />
      <div className="start-blob-b absolute -bottom-[18rem] -left-[14rem] size-[30rem] rounded-full bg-[#efe7da]/70 dark:bg-[#d9a877]/[0.04]" />
      <div className="start-orbit absolute top-1/2 left-1/2 size-[34rem] rounded-full border border-dashed border-sage/15 sm:size-[44rem] dark:border-sage/[0.08]" />
      <div className="absolute top-1/2 left-1/2 size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sage/10 sm:size-[32rem] dark:border-sage/[0.06]" />
    </div>
  );
}

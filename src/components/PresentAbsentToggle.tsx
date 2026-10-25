// A per-student present/absent segmented control (MarkAttendance fast path).

export function PresentAbsentToggle(props: {
  present: boolean;
  disabled?: boolean;
  onChange: (present: boolean) => void;
}): JSX.Element {
  const { present, disabled, onChange } = props;
  return (
    <div className="pa-toggle" role="group" aria-label="Attendance">
      <button
        type="button"
        className={`pa-btn ${present ? 'pa-present' : ''}`}
        aria-pressed={present}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        Present
      </button>
      <button
        type="button"
        className={`pa-btn ${present ? '' : 'pa-absent'}`}
        aria-pressed={!present}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        Absent
      </button>
    </div>
  );
}

import styles from './SidebarFilters.module.css';

/**
 * Sidebar component that displays a list of engineering disciplines
 * users can select to filter projects. The parent component is
 * responsible for maintaining state; selectedCategories is an array
 * of strings and onChange is called with the new array when a
 * checkbox is toggled. If no selections are made, all disciplines
 * are shown.
 */
export default function SidebarFilters({ categories, selectedCategories, onChange }) {
  const toggleCategory = (cat) => {
    let next;
    if (selectedCategories.includes(cat)) {
      next = selectedCategories.filter((c) => c !== cat);
    } else {
      next = [...selectedCategories, cat];
    }
    onChange(next);
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.heading}>Categories</div>
      {categories.map((cat) => (
        <label key={cat} className={styles.item}>
          <input
            type="checkbox"
            checked={selectedCategories.includes(cat)}
            onChange={() => toggleCategory(cat)}
          />
          {cat}
        </label>
      ))}
    </aside>
  );
}
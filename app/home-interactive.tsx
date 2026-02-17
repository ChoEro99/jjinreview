import React from 'react'; // Imports and other components...

const HomeInteractive = ({ isMobile, showDetailPane }) => {
  // Other states and functions...

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', alignItems: 'start', minWidth: 0 }}> {/* Updated grid container */} 
      <aside style={{ minWidth: 0 }}> {/* Updated aside style */}
        {/* Search pane content... */}
      </aside>
      <section style={{ padding: isMobile ? 0 : 4, display: showDetailPane ? "block" : "none", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}> {/* Updated detail section wrapper */}
        {/* Detail pane content... */}
      </section>
    </div>
  );
};

export default HomeInteractive;
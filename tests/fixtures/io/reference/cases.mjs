// Invented ProcessList cases for the reference codec tests. No customer or project content: every name below was
// written for these tests. Shapes follow the engine's ProcessList (processes[].lanes[].nodes[], connections[]).

const n = (type, label, extra = {}) => ({ type, label, ...extra });
const c = (source, target, extra = {}) => ({ source, target, ...extra });

/** C1 basic: two lanes, an application, labelled gateway flows, an input, an output, a document. */
export const C1 = {
  processes: [{
    name: "Order handling",
    lanes: [
      { name: "Sales", nodes: [
        n("START", "Order received"),
        n("TASK_INPUT", "Order form"),
        n("TASK", "Check order", { app_label: "Order desk" }),
        n("GATEWAY", "Order complete?", { subtype: "OR" }),
        n("TASK", "Ship order"),
        n("TASK_OUTPUT", "Shipping note"),
        n("DOCUMENT", "Shipping policy"),
        n("END", "Order shipped"),
      ] },
      { name: "Support", nodes: [n("TASK", "Request details")] },
    ],
    connections: [
      c("Order received", "Check order"),
      c("Check order", "Order complete?"),
      c("Order complete?", "Ship order", { label: "yes" }),
      c("Order complete?", "Request details", { label: "no" }),
      c("Request details", "Check order"),
      c("Ship order", "Order shipped"),
      c("Order form", "Check order", { kind: "DATA" }),
      c("Ship order", "Shipping note", { kind: "DATA" }),
      c("Shipping policy", "Ship order", { kind: "DOC" }),
    ],
  }],
};

/** C2 pages: links to other pages by exact name, section number, facts flag and substring; a Unicode boundary miss. */
export const C2 = {
  processes: [
    { name: "Sales overview", lanes: [{ name: "Desk", nodes: [
      n("START", "Start"),
      n("SUB-PROCESS", "Quote preparation"),
      n("EXTERNAL_PROCESS", "Run 2.1 checks"),
      n("TASK", "Archive", { sub_process: true }),
      n("SUB-PROCESS", "Étape2.1"),
      n("END", "Done"),
    ] }], connections: [
      c("Start", "Quote preparation"), c("Quote preparation", "Run 2.1 checks"), c("Run 2.1 checks", "Archive"),
      c("Archive", "Étape2.1"), c("Étape2.1", "Done"),
    ] },
    { name: "Quote preparation", lanes: [{ name: "Desk", nodes: [n("START", "Quote start"), n("TASK", "Price items"), n("END", "Quote ready")] }],
      connections: [c("Quote start", "Price items"), c("Price items", "Quote ready")] },
    { name: "2.1 Credit check", lanes: [{ name: "Finance", nodes: [n("START", "Check start"), n("TASK", "Score customer"), n("END", "Check done")] }],
      connections: [c("Check start", "Score customer"), c("Score customer", "Check done")] },
    { name: "Archive records", lanes: [{ name: "Records", nodes: [n("START", "Archive start"), n("TASK", "Store file"), n("END", "Archived")] }],
      connections: [c("Archive start", "Store file"), c("Store file", "Archived")] },
  ],
};

/** C3 lanes: two lanes named Team, an unnamed lane, artifacts at a lane-block boundary. */
export const C3 = {
  processes: [{
    name: "Team work",
    lanes: [
      { name: "Team", nodes: [n("START", "Kick-off"), n("TASK", "Plan work")] },
      { name: "", nodes: [n("TASK", "Draft"), n("TASK_INPUT", "Checklist")] },
      { name: "Team", nodes: [n("TASK_INPUT", "Spec"), n("TASK", "Build"), n("END", "Delivered")] },
    ],
    connections: [
      c("Kick-off", "Plan work"), c("Plan work", "Draft"), c("Draft", "Build"), c("Build", "Delivered"),
      c("Spec", "Build", { kind: "DATA" }), c("Checklist", "Build", { kind: "DATA" }),
    ],
  }],
};

/** C4 shared: an item linked in and out, a document linked to two tasks, labelled DATA and DOC links. */
export const C4 = {
  processes: [{
    name: "Request review",
    lanes: [{ name: "Office", nodes: [
      n("START", "Received"),
      n("TASK", "Prepare", { app_label: "File tool" }),
      n("TASK_OUTPUT", "Request file"),
      n("DOCUMENT", "Guide"),
      n("TASK", "Review"),
      n("END", "Closed"),
    ] }],
    connections: [
      c("Received", "Prepare"), c("Prepare", "Review"), c("Review", "Closed"),
      c("Prepare", "Request file", { kind: "DATA", label: "draft" }),
      c("Request file", "Review", { kind: "DATA" }),
      c("Guide", "Prepare", { kind: "DOC", label: "see part 4" }),
      c("Guide", "Review", { kind: "DOC" }),
    ],
  }],
};

/** C6 text: characters that need escaping, accents, symbols (DI values are edited by the builder). */
export const C6 = {
  processes: [{
    name: "Q&A <review> \"fast\" 'track'",
    lanes: [{ name: "R&D", nodes: [
      n("START", "Début"),
      n("TASK", "Cost > 10 € & < 20 $", { app_label: "Tool \"A\" & B" }),
      n("TASK_INPUT", "Note 'v2'"),
      n("END", "Fin"),
    ] }],
    connections: [c("Début", "Cost > 10 € & < 20 $"), c("Cost > 10 € & < 20 $", "Fin"), c("Note 'v2'", "Cost > 10 € & < 20 $", { kind: "DATA" })],
  }],
};

/** C7 order: one task with three documents, two inputs and two outputs (the builder permutes their DI order). */
export const C7 = {
  processes: [{
    name: "Ordering",
    lanes: [{ name: "Unit", nodes: [
      n("START", "Go"),
      n("TASK", "Assemble"),
      n("DOCUMENT", "Doc one"), n("DOCUMENT", "Doc two"), n("DOCUMENT", "Doc three"),
      n("TASK_INPUT", "In one"), n("TASK_INPUT", "In two"),
      n("TASK_OUTPUT", "Out one"), n("TASK_OUTPUT", "Out two"),
      n("END", "Stop"),
    ] }],
    connections: [
      c("Go", "Assemble"), c("Assemble", "Stop"),
      c("Doc one", "Assemble", { kind: "DOC" }), c("Doc two", "Assemble", { kind: "DOC" }), c("Doc three", "Assemble", { kind: "DOC" }),
      c("In one", "Assemble", { kind: "DATA" }), c("In two", "Assemble", { kind: "DATA" }),
      c("Assemble", "Out one", { kind: "DATA" }), c("Assemble", "Out two", { kind: "DATA" }),
    ],
  }],
};

/** R1 rendering case (tests/fixtures/ui/R1.bpmn): every element kind the two looks draw, a long label to wrap. */
export const R1 = {
  processes: [{
    name: "Service desk",
    lanes: [
      { name: "Front desk", nodes: [
        n("START", "Request in"),
        n("TASK_INPUT", "Request form"),
        n("TASK", "Log request", { app_label: "Ticket tool" }),
        n("TASK_OUTPUT", "Ticket"),
        n("TASK", "Check the incoming request against all the applicable rules and record the outcome"),
        n("DOCUMENT", "Desk manual"),
        n("GATEWAY", "Valid?", { subtype: "OR" }),
        n("END", "Request done"),
      ] },
      { name: "Back office", nodes: [n("SUB-PROCESS", "Resolve issue"), n("EXTERNAL_PROCESS", "Escalate")] },
    ],
    connections: [
      c("Request in", "Log request"),
      c("Log request", "Check the incoming request against all the applicable rules and record the outcome"),
      c("Check the incoming request against all the applicable rules and record the outcome", "Valid?"),
      c("Valid?", "Request done", { label: "yes" }),
      c("Valid?", "Resolve issue", { label: "no" }),
      c("Resolve issue", "Escalate"),
      c("Escalate", "Request done"),
      c("Request form", "Log request", { kind: "DATA" }),
      c("Log request", "Ticket", { kind: "DATA" }),
      c("Desk manual", "Check the incoming request against all the applicable rules and record the outcome", { kind: "DOC" }),
    ],
  }],
};

// Configuration object for graph settings
const defaultConfig = {
  dimensions: {
    width: 1200,
    height: 1200,
  },
  node: {
    baseRadius: 7,
    radiusMultiplier: 0.5,
    fill: "#1f77b4",
    tagFill: "#cc77cc",
    highlightFill: "#ff6b6b", // Highlight color for nodes
    fontSize: 0,
    hoverFontSize: 25,
    textColor: "#333333", // Added text color configuration
    textYOffset: 30, // Added offset for text below node
    dimOpacity: 0.2,
    highlightOpacity: 1,
    transitionDuration: 300,
  },
  link: {
    stroke: "#999",
    highlightStroke: "#ff6b6b",
    opacity: 1,
    strength: 2,
    dimOpacity: 0.2,
    highlightOpacity: 1,
    arrowSize: 3, // Size of the arrow marker
  },
  forces: {
    centerForce: 0.2, // How strongly nodes are pulled to the center (0-1)
    repelForce: -500, // How strongly nodes push away from each other
    linkForce: 0.3, // How strongly connected nodes pull together (0-1)
    linkDistance: 50, // Base distance between connected nodes
  },
  zoom: {
    min: 0.1,
    max: 10,
    defaultScale: 0.6,
  },
};

class GraphVisualizer {
  constructor(containerId) {
    this.containerId = containerId;
    this.svg = null;
    this.simulation = null;
    this.zoomGroup = null;
    this.nodes = null;
    this.links = null;
  }

  async initialize(dataUrl, tagsUrl) {
    try {
      const graphData = await d3.json(dataUrl);
      const tags = await d3.json("tags.json");

      const processedData = this.processGraphData(graphData, tags);
      this.setupSimulation(processedData);
      this.createVisualization(processedData);
      this.setupZoom();
    } catch (error) {
      console.error("Failed to initialize graph:", error);
    }
  }

  calculateConnectionCounts(nodes, links) {
    const counts = Object.fromEntries(nodes.map((node) => [node.path, 0]));

    links.forEach((link) => {
      counts[link.source]++;
      counts[link.target]++;
    });

    return counts;
  }

  processGraphData(rawData, tags) {
    const validPaths = rawData.notes.map((note) => note.path);
    const links = rawData.links
      .filter(
        (edge) =>
          validPaths.includes(edge.targetPath) &&
          validPaths.includes(edge.sourcePath),
      )
      .map((edge) => ({
        // We link nodes base on their "path"
        source: edge.sourcePath,
        target: edge.targetPath,
      }));

    const connectionCounts = this.calculateConnectionCounts(
      rawData.notes,
      links,
    );

    const nodes = rawData.notes.map((note) => ({
      ...note,
      type: "note",
      connections: connectionCounts[note.path] || 0,
      active: defaultConfig.node.highlightFill,
      inactive: defaultConfig.node.fill,
    }));

    tags.map((tag) => {
      const tagLinks = rawData.notes.filter((note) =>
        note.tags.includes(tag.name),
      );

      // NOTE: We link nodes base on their path
      const tagNode = {
        title: tag.name,
        connections: tagLinks.length,
        type: "tag",
        id: 999,
        path: tag.name,
        active: defaultConfig.node.highlightFill,
        inactive: defaultConfig.node.tagFill,
      };
      nodes.push(tagNode);
      tagLinks.map((note) => {
        // console.log(note);
        links.push({
          source: tagNode.path,
          target: note.path,
        });
      });
    });

    // console.log(rawData.links);
    // console.log(links);
    // console.log(nodes);
    // console.log(tags);

    return { nodes, links };
  }

  setupSimulation(data) {
    // Calculate the maximum number of connections for normalization
    const maxConnections = Math.max(
      ...data.nodes.map((node) => node.connections),
    );

    this.simulation = d3
      .forceSimulation(data.nodes)
      // Center force - pulls nodes toward the center, stronger for well-connected nodes
      .force(
        "x",
        d3.forceX().strength((d) => {
          // Normalize connections to get a value between 0 and 1
          const connectionStrength = d.connections / maxConnections;
          // More connections = stronger pull to center
          return defaultConfig.forces.centerForce * (1 + connectionStrength);
        }),
      )
      .force(
        "y",
        d3.forceY().strength((d) => {
          const connectionStrength = d.connections / maxConnections;
          return defaultConfig.forces.centerForce * (1 + connectionStrength);
        }),
      )

      // Repel force - pushes nodes away from each other
      .force(
        "charge",
        d3.forceManyBody().strength(defaultConfig.forces.repelForce),
      )

      // Link force - maintains connections between nodes
      .force(
        "link",
        d3
          .forceLink(data.links)
          .id((d) => d.path)
          .strength(defaultConfig.forces.linkForce)
          .distance(defaultConfig.forces.linkDistance),
      );

    // These x and y forces are now handled in the center force above

    // Adjust simulation parameters for stability
    this.simulation
      .alphaDecay(0.02) // Slower cooling
      .velocityDecay(0.2) // More momentum
      .alpha(0.5)
      .restart();
  }

  createVisualization(data) {
    this.createSvgContainer();
    this.zoomGroup = this.svg.append("g").attr("class", "zoom-group");

    // Store references to nodes and links
    this.links = this.createLinks(data.links);
    this.nodes = this.createNodeGroups(data.nodes);

    this.setupSimulationTick(this.nodes, this.links);
  }

  createSvgContainer() {
    const { width, height } = defaultConfig.dimensions;
    this.svg = d3
      .select(`#${this.containerId}`)
      .append("svg")
      .attr("viewBox", [-width / 2, -height / 2, width, height]);
  }

  setupZoom() {
    const zoom = d3
      .zoom()
      .scaleExtent([defaultConfig.zoom.min, defaultConfig.zoom.max])
      .on("zoom", (event) => {
        this.zoomGroup.attr("transform", event.transform);
      });

    this.svg
      .call(zoom)
      .call(
        zoom.transform,
        d3.zoomIdentity.scale(defaultConfig.zoom.defaultScale),
      );
  }

  createLinks(links) {
    return this.zoomGroup
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", defaultConfig.link.stroke)
      .attr("stroke-opacity", defaultConfig.link.opacity)
      .attr("stroke-width", 2);
  }

  createNodeGroups(nodes) {
    const container = this.zoomGroup
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g");

    // Add circles to nodes
    container
      .filter((d) => d.type == "note")
      .append("circle")
      .attr(
        "r",
        (d) =>
          defaultConfig.node.baseRadius +
          d.connections * defaultConfig.node.radiusMultiplier,
      )
      .attr("fill", defaultConfig.node.fill);

    container
      .filter((d) => d.type == "tag")
      .append("circle")
      .attr(
        "r",
        (d) =>
          defaultConfig.node.baseRadius +
          d.connections * defaultConfig.node.radiusMultiplier,
      )
      .attr("fill", defaultConfig.node.tagFill);

    // Add labels to nodes with updated positioning and color
    container
      .append("text")
      .attr(
        "dy",
        (d) =>
          defaultConfig.node.baseRadius +
          d.connections * defaultConfig.node.radiusMultiplier +
          defaultConfig.node.textYOffset,
      )
      .attr("text-anchor", "middle") // Center the text below the node
      .style("fill", defaultConfig.node.textColor) // Set text color
      .style("font-size", defaultConfig.node.fontSize)
      .style("opacity", 0)
      .text((d) => d.title);

    // Add tooltips
    container
      .append("title")
      .text((d) => `${d.title}\nConnections: ${d.connections}`);

    this.setupNodeInteractions(container);
    return container;
  }

  getConnectedNodes(sourceNode) {
    const connected = new Set();
    const links = this.simulation.force("link").links();

    links.forEach((link) => {
      if (link.source.path === sourceNode.path) {
        connected.add(link.target.path);
      } else if (link.target.path === sourceNode.path) {
        connected.add(link.source.path);
      }
    });

    return connected;
  }

  getConnectedLinks(sourceNode) {
    const connectedLinks = new Set();
    const links = this.simulation.force("link").links();

    links.forEach((link) => {
      if (
        link.source.path === sourceNode.path ||
        link.target.path === sourceNode.path
      ) {
        connectedLinks.add(link);
      }
    });

    return connectedLinks;
  }

  setupNodeInteractions(container) {
    // Create drag behavior
    const drag = d3
      .drag()
      .on("start", (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    container
      .call(drag)
      .on("mouseover", (event, d) => {
        // Only trigger if hovering over the circle
        if (event.target.tagName !== "circle") return;

        const connectedNodes = this.getConnectedNodes(d);
        const connectedLinks = this.getConnectedLinks(d);

        // Dim all nodes initially
        this.zoomGroup
          .selectAll(".nodes g")
          .style(
            "transition",
            `opacity ${defaultConfig.node.transitionDuration}ms`,
          )
          .style("opacity", defaultConfig.node.dimOpacity)
          .select("circle")
          .style(
            "transition",
            `fill ${defaultConfig.node.transitionDuration}ms`,
          );
        // .style("fill", d.active);

        // Highlight connected nodes
        this.zoomGroup
          .selectAll(".nodes g")
          .filter((n) => n.path === d.path || connectedNodes.has(n.path))
          .style(
            "transition",
            `opacity ${defaultConfig.node.transitionDuration}ms`,
          )
          .style("opacity", defaultConfig.node.highlightOpacity)
          .select("circle")
          .style(
            "transition",
            `fill ${defaultConfig.node.transitionDuration}ms`,
          )
          .style("fill", d.active);

        // Show text for hovered node only
        d3.select(event.currentTarget)
          .select("text")
          // .style(
          //   "transition",
          //   `opacity ${CONFIG.node.transitionDuration}ms, font-size ${CONFIG.node.transitionDuration}ms`,
          // )
          .style("opacity", 1)
          .style("font-size", defaultConfig.node.hoverFontSize);

        // Dim all links
        this.zoomGroup
          .selectAll(".links line")
          .style(
            "transition",
            `opacity ${defaultConfig.link.transitionDuration}ms, stroke ${defaultConfig.link.transitionDuration}ms, stroke-width ${defaultConfig.link.transitionDuration}ms`,
          )
          .style("opacity", defaultConfig.link.dimOpacity)
          .style("stroke", defaultConfig.link.stroke)
          .style("stroke-width", 1);

        // Highlight connected links
        this.zoomGroup
          .selectAll(".links line")
          .filter((l) => connectedLinks.has(l))
          .style(
            "transition",
            `opacity ${defaultConfig.link.transitionDuration}ms, stroke ${defaultConfig.link.transitionDuration}ms, stroke-width ${defaultConfig.link.transitionDuration}ms`,
          )
          .style("opacity", defaultConfig.link.highlightOpacity)
          .style("stroke", defaultConfig.link.highlightStroke)
          .style("stroke-width", 2);
      })
      .on("mouseout", (event) => {
        // Only trigger if leaving the circle
        if (event.target.tagName !== "circle") return;
        // Reset all nodes
        this.zoomGroup
          .selectAll(".nodes g")
          .style(
            "transition",
            `opacity ${defaultConfig.node.transitionDuration}ms`,
          )
          .style("opacity", defaultConfig.node.highlightOpacity)
          .select("circle")
          .style(
            "transition",
            `fill ${defaultConfig.node.transitionDuration}ms`,
          )
          .style("fill", (d) => d.inactive);

        // Hide all text
        this.zoomGroup
          .selectAll("text")
          // .style(
          //   "transition",
          //   `opacity ${CONFIG.node.transitionDuration}ms, font-size ${CONFIG.node.transitionDuration}ms`,
          // )
          .style("opacity", 0)
          .style("font-size", defaultConfig.node.fontSize);

        // Reset all links
        this.zoomGroup
          .selectAll(".links line")
          .style(
            "transition",
            `opacity ${defaultConfig.link.transitionDuration}ms, stroke ${defaultConfig.link.transitionDuration}ms, stroke-width ${defaultConfig.link.transitionDuration}ms`,
          )
          .style("opacity", defaultConfig.link.opacity)
          .style("stroke", defaultConfig.link.stroke)
          .style("stroke-width", 1);
      })
      .on("click", this.handleNodeClick);
  }

  handleNodeClick(event) {
    const file = event.srcElement.__data__.absPath;
    const request = new XMLHttpRequest();
    request.open("GET", document.URL + "open" + "?file=" + file, false);
    request.send();
  }

  setupSimulationTick(nodeGroups, links) {
    this.simulation.on("tick", () => {
      nodeGroups.attr("transform", (d) => `translate(${d.x}, ${d.y})`);

      links
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
    });
  }
}

const ConfigSlider = ({ label, value, onChange, min, max, step }) =>
  React.createElement(
    "div",
    { className: "mb-4" },
    React.createElement(
      "label",
      { className: "block text-sm font-medium mb-2" },
      `${label}: ${value}`,
    ),
    React.createElement("input", {
      type: "range",
      min: min,
      max: max,
      step: step,
      value: value,
      onChange: (e) => onChange(parseFloat(e.target.value)),
      className: "w-full",
    }),
  );

const InteractiveGraph = () => {
  // Load config from localStorage or use default
  const loadConfig = () => {
    const savedConfig = localStorage.getItem("graphConfig");
    return savedConfig ? JSON.parse(savedConfig) : defaultConfig;
  };

  const [config, setConfig] = React.useState(loadConfig());
  const [graph, setGraph] = React.useState(null);

  React.useEffect(() => {
    if (!graph) {
      const newGraph = new GraphVisualizer("graphcontainer");
      setGraph(newGraph);
      newGraph.initialize("graph.json");
    }
  }, []);

  const updateConfig = (category, param, value) => {
    const newConfig = {
      ...config,
      [category]: {
        ...config[category],
        [param]: value,
      },
    };
    setConfig(newConfig);

    // Save to localStorage
    localStorage.setItem("graphConfig", JSON.stringify(newConfig));

    if (graph) {
      graph.simulation.force("charge").strength(newConfig.forces.repelForce);

      graph.simulation
        .force("link")
        .strength(newConfig.forces.linkForce)
        .distance(newConfig.forces.linkDistance);

      const maxConnections = Math.max(
        ...graph.simulation.nodes().map((node) => node.connections),
      );

      graph.simulation.force("x").strength((d) => {
        const connectionStrength = d.connections / maxConnections;
        return newConfig.forces.centerForce * (1 + connectionStrength);
      });

      graph.simulation.force("y").strength((d) => {
        const connectionStrength = d.connections / maxConnections;
        return newConfig.forces.centerForce * (1 + connectionStrength);
      });

      graph.simulation.alpha(0.3).restart();

      graph.zoomGroup
        .selectAll(".nodes circle")
        .attr(
          "r",
          (d) =>
            newConfig.node.baseRadius +
            d.connections * newConfig.node.radiusMultiplier,
        );
    }
  };

  // Add reset button handler
  const resetConfig = () => {
    localStorage.removeItem("graphConfig");
    setConfig(defaultConfig);
    if (graph) {
      // Apply default config to graph
      updateConfig("forces", "repelForce", defaultConfig.forces.repelForce);
      updateConfig("forces", "linkForce", defaultConfig.forces.linkForce);
      updateConfig("forces", "centerForce", defaultConfig.forces.centerForce);
      updateConfig("forces", "linkDistance", defaultConfig.forces.linkDistance);
      updateConfig("node", "baseRadius", defaultConfig.node.baseRadius);
      updateConfig(
        "node",
        "radiusMultiplier",
        defaultConfig.node.radiusMultiplier,
      );
    }
  };

  // Create a container div that will hold both the graph and controls
  return React.createElement(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
      },
    },
    // Graph container
    React.createElement("div", {
      id: "graphcontainer",
      style: {
        flex: "1",
        position: "relative",
      },
    }),
    // Controls panel
    React.createElement(
      "div",
      {
        style: {
          width: "300px",
          padding: "20px",
          backgroundColor: "white",
          boxShadow: "-2px 0 5px rgba(0,0,0,0.1)",
          overflowY: "auto",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1em",
          },
        },
        React.createElement(
          "h2",
          {
            style: {
              fontSize: "1.2em",
              fontWeight: "bold",
              margin: 0,
            },
          },
          "Graph Controls",
        ),
        React.createElement(
          "button",
          {
            onClick: resetConfig,
            style: {
              padding: "5px 10px",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            },
          },
          "Reset",
        ),
      ),
      React.createElement(
        "div",
        null,
        React.createElement(
          "h3",
          { style: { fontSize: "1.1em", fontWeight: "500", marginTop: "1em" } },
          "Node Settings",
        ),
        React.createElement(ConfigSlider, {
          label: "Base Radius",
          value: config.node.baseRadius,
          onChange: (v) => updateConfig("node", "baseRadius", v),
          min: 1,
          max: 20,
          step: 0.5,
        }),
        React.createElement(ConfigSlider, {
          label: "Radius Multiplier",
          value: config.node.radiusMultiplier,
          onChange: (v) => updateConfig("node", "radiusMultiplier", v),
          min: 0,
          max: 2,
          step: 0.1,
        }),
      ),
      React.createElement(
        "div",
        null,
        React.createElement(
          "h3",
          { style: { fontSize: "1.1em", fontWeight: "500", marginTop: "1em" } },
          "Force Settings",
        ),
        React.createElement(ConfigSlider, {
          label: "Center Force",
          value: config.forces.centerForce,
          onChange: (v) => updateConfig("forces", "centerForce", v),
          min: 0,
          max: 1,
          step: 0.05,
        }),
        React.createElement(ConfigSlider, {
          label: "Repel Force",
          value: config.forces.repelForce,
          onChange: (v) => updateConfig("forces", "repelForce", v),
          min: -1000,
          max: 0,
          step: 10,
        }),
        React.createElement(ConfigSlider, {
          label: "Link Force",
          value: config.forces.linkForce,
          onChange: (v) => updateConfig("forces", "linkForce", v),
          min: 0,
          max: 1,
          step: 0.05,
        }),
        React.createElement(ConfigSlider, {
          label: "Link Distance",
          value: config.forces.linkDistance,
          onChange: (v) => updateConfig("forces", "linkDistance", v),
          min: 10,
          max: 200,
          step: 5,
        }),
      ),
    ),
  );
};

// Create a container for the app if it doesn't exist
if (!document.getElementById("app")) {
  const appDiv = document.createElement("div");
  appDiv.id = "app";
  document.body.appendChild(appDiv);
}

// Render the component
const root = ReactDOM.createRoot(document.getElementById("app"));
root.render(React.createElement(InteractiveGraph));

"use client";

import * as React from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toast } from "@/app/(app)/toast";
import { 
  Pencil, 
  ArrowUpRight, 
  Circle, 
  Square, 
  Type, 
  Trash2, 
  X,
  Palette,
  Minus,
  Plus
} from "lucide-react";

type Tool = "pen" | "arrow" | "circle" | "rectangle" | "text";

type Annotation = {
  id: string;
  timestamp_seconds: number;
  duration_seconds: number;
  tool: Tool;
  color: string;
  stroke_width: number;
  path_data: number[][];
  text_content?: string;
};

type Point = { x: number; y: number };

const COLORS = ["#ff0000", "#00ff00", "#0066ff", "#ffff00", "#ff00ff", "#ffffff"];
const STROKE_WIDTHS = [2, 4, 6, 8];

type Props = {
  videoId: string;
  videoElement: HTMLVideoElement | null;
  isCoach: boolean;
};

export default function VideoAnnotationCanvas({ videoId, videoElement, isCoach }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [annotations, setAnnotations] = React.useState<Annotation[]>([]);
  const [tool, setTool] = React.useState<Tool>("pen");
  const [color, setColor] = React.useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = React.useState(4);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [currentPath, setCurrentPath] = React.useState<Point[]>([]);
  const [startPoint, setStartPoint] = React.useState<Point | null>(null);
  const [showToolbar, setShowToolbar] = React.useState(false);
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [textInput, setTextInput] = React.useState("");
  const [textPosition, setTextPosition] = React.useState<Point | null>(null);

  // Load annotations
  React.useEffect(() => {
    loadAnnotations();
  }, [videoId]);

  // Render annotations on time update
  React.useEffect(() => {
    if (!videoElement) return;
    
    function onTimeUpdate() {
      renderAnnotations();
    }
    
    videoElement.addEventListener("timeupdate", onTimeUpdate);
    return () => videoElement.removeEventListener("timeupdate", onTimeUpdate);
  }, [videoElement, annotations]);

  // Resize canvas to match video
  React.useEffect(() => {
    if (!canvasRef.current || !videoElement) return;
    
    function resize() {
      const canvas = canvasRef.current;
      const video = videoElement;
      if (!canvas || !video) return;
      
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      renderAnnotations();
    }
    
    resize();
    window.addEventListener("resize", resize);
    videoElement.addEventListener("loadedmetadata", resize);
    
    return () => {
      window.removeEventListener("resize", resize);
      videoElement?.removeEventListener("loadedmetadata", resize);
    };
  }, [videoElement]);

  async function loadAnnotations() {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("video_annotations")
        .select("*")
        .eq("video_id", videoId)
        .order("timestamp_seconds");
      
      if (!error && data) {
        setAnnotations(data.map((a: any) => ({
          id: a.id,
          timestamp_seconds: Number(a.timestamp_seconds),
          duration_seconds: Number(a.duration_seconds),
          tool: a.tool as Tool,
          color: a.color,
          stroke_width: a.stroke_width,
          path_data: a.path_data as number[][],
          text_content: a.text_content
        })));
      }
    } catch (err) {
      console.error("Failed to load annotations:", err);
    }
  }

  function getCanvasCoords(e: React.MouseEvent | React.TouchEvent): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Normalize to 0-1
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!showToolbar || !isCoach) return;
    
    const point = getCanvasCoords(e);
    
    if (tool === "text") {
      setTextPosition(point);
      return;
    }
    
    setIsDrawing(true);
    setStartPoint(point);
    setCurrentPath([point]);
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !showToolbar) return;
    
    const point = getCanvasCoords(e);
    
    if (tool === "pen") {
      setCurrentPath((prev) => [...prev, point]);
    }
    
    // Live preview
    renderAnnotations();
    renderCurrentDrawing(point);
  }

  function handlePointerUp() {
    if (!isDrawing || !startPoint) {
      setIsDrawing(false);
      return;
    }
    
    const endPoint = currentPath[currentPath.length - 1] || startPoint;
    saveAnnotation(startPoint, endPoint, currentPath);
    
    setIsDrawing(false);
    setCurrentPath([]);
    setStartPoint(null);
  }

  async function saveAnnotation(start: Point, end: Point, path: Point[]) {
    if (!videoElement) return;
    
    const timestamp = videoElement.currentTime;
    let pathData: number[][];
    
    if (tool === "pen") {
      pathData = path.map((p) => [p.x, p.y]);
    } else {
      pathData = [[start.x, start.y], [end.x, end.y]];
    }
    
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("add_video_annotation", {
        p_video_id: videoId,
        p_timestamp_seconds: timestamp,
        p_duration_seconds: 5,
        p_tool: tool,
        p_color: color,
        p_stroke_width: strokeWidth,
        p_path_data: pathData,
        p_text_content: null
      });
      
      if (!error && data) {
        setAnnotations((prev) => [...prev, {
          id: data,
          timestamp_seconds: timestamp,
          duration_seconds: 5,
          tool,
          color,
          stroke_width: strokeWidth,
          path_data: pathData,
          text_content: undefined
        }]);
        toast("Annotation saved");
      }
    } catch (err) {
      console.error("Failed to save annotation:", err);
    }
  }

  async function saveTextAnnotation() {
    if (!textPosition || !textInput.trim() || !videoElement) return;
    
    const timestamp = videoElement.currentTime;
    const pathData = [[textPosition.x, textPosition.y]];
    
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("add_video_annotation", {
        p_video_id: videoId,
        p_timestamp_seconds: timestamp,
        p_duration_seconds: 5,
        p_tool: "text",
        p_color: color,
        p_stroke_width: strokeWidth,
        p_path_data: pathData,
        p_text_content: textInput.trim()
      });
      
      if (!error && data) {
        setAnnotations((prev) => [...prev, {
          id: data,
          timestamp_seconds: timestamp,
          duration_seconds: 5,
          tool: "text",
          color,
          stroke_width: strokeWidth,
          path_data: pathData,
          text_content: textInput.trim()
        }]);
        toast("Text annotation saved");
      }
    } catch (err) {
      console.error("Failed to save text annotation:", err);
    }
    
    setTextInput("");
    setTextPosition(null);
  }

  async function deleteAnnotation(id: string) {
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("delete_video_annotation", {
        p_annotation_id: id
      });
      
      if (!error) {
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
        toast("Annotation deleted");
      }
    } catch (err) {
      console.error("Failed to delete annotation:", err);
    }
  }

  function renderAnnotations() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !videoElement) return;
    
    const currentTime = videoElement.currentTime;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (const ann of annotations) {
      const start = ann.timestamp_seconds;
      const end = start + ann.duration_seconds;
      
      if (currentTime >= start && currentTime <= end) {
        renderAnnotation(ctx, ann, canvas.width, canvas.height);
      }
    }
  }

  function renderAnnotation(
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    width: number,
    height: number
  ) {
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.stroke_width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    const path = ann.path_data;
    
    switch (ann.tool) {
      case "pen":
        if (path.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(path[0][0] * width, path[0][1] * height);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i][0] * width, path[i][1] * height);
        }
        ctx.stroke();
        break;
        
      case "arrow":
        if (path.length < 2) return;
        const [x1, y1] = [path[0][0] * width, path[0][1] * height];
        const [x2, y2] = [path[1][0] * width, path[1][1] * height];
        
        // Line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // Arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 15;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle - Math.PI / 6),
          y2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          x2 - headLen * Math.cos(angle + Math.PI / 6),
          y2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
        break;
        
      case "circle":
        if (path.length < 2) return;
        const cx = ((path[0][0] + path[1][0]) / 2) * width;
        const cy = ((path[0][1] + path[1][1]) / 2) * height;
        const rx = Math.abs(path[1][0] - path[0][0]) * width / 2;
        const ry = Math.abs(path[1][1] - path[0][1]) * height / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
        
      case "rectangle":
        if (path.length < 2) return;
        const rx1 = path[0][0] * width;
        const ry1 = path[0][1] * height;
        const rw = (path[1][0] - path[0][0]) * width;
        const rh = (path[1][1] - path[0][1]) * height;
        ctx.strokeRect(rx1, ry1, rw, rh);
        break;
        
      case "text":
        if (!ann.text_content || path.length < 1) return;
        const tx = path[0][0] * width;
        const ty = path[0][1] * height;
        ctx.font = `bold ${16 + ann.stroke_width * 2}px sans-serif`;
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text_content, tx, ty);
        break;
    }
  }

  function renderCurrentDrawing(endPoint: Point) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !startPoint) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    switch (tool) {
      case "pen":
        if (currentPath.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x * width, currentPath[0].y * height);
        for (let i = 1; i < currentPath.length; i++) {
          ctx.lineTo(currentPath[i].x * width, currentPath[i].y * height);
        }
        ctx.stroke();
        break;
        
      case "arrow":
        const x1 = startPoint.x * width;
        const y1 = startPoint.y * height;
        const x2 = endPoint.x * width;
        const y2 = endPoint.y * height;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
        
      case "circle":
        const cx = ((startPoint.x + endPoint.x) / 2) * width;
        const cy = ((startPoint.y + endPoint.y) / 2) * height;
        const rx = Math.abs(endPoint.x - startPoint.x) * width / 2;
        const ry = Math.abs(endPoint.y - startPoint.y) * height / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
        
      case "rectangle":
        const rx1 = startPoint.x * width;
        const ry1 = startPoint.y * height;
        const rw = (endPoint.x - startPoint.x) * width;
        const rh = (endPoint.y - startPoint.y) * height;
        ctx.strokeRect(rx1, ry1, rw, rh);
        break;
    }
  }

  if (!isCoach) {
    // Non-coaches just see the canvas for viewing annotations
    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none"
        }}
      />
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          cursor: showToolbar ? "crosshair" : "default",
          pointerEvents: showToolbar ? "auto" : "none"
        }}
      />

      {/* Text input dialog */}
      {textPosition && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#0d1420",
            border: "1px solid #1a2436",
            borderRadius: 12,
            padding: 16,
            zIndex: 20
          }}
        >
          <input
            type="text"
            className="input"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter text..."
            autoFocus
            style={{ marginBottom: 12 }}
          />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setTextPosition(null)}>
              Cancel
            </button>
            <button className="btn btnPrimary" onClick={saveTextAnnotation}>
              Add
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setShowToolbar(!showToolbar)}
        className={showToolbar ? "pill" : "btn"}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10
        }}
      >
        <Pencil size={16} />
        {showToolbar ? "Done" : "Annotate"}
      </button>

      {/* Drawing toolbar */}
      {showToolbar && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0d1420",
            border: "1px solid #1a2436",
            borderRadius: 12,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 10
          }}
        >
          <button
            className={tool === "pen" ? "pill" : "btn"}
            onClick={() => setTool("pen")}
            title="Freehand"
          >
            <Pencil size={18} />
          </button>
          <button
            className={tool === "arrow" ? "pill" : "btn"}
            onClick={() => setTool("arrow")}
            title="Arrow"
          >
            <ArrowUpRight size={18} />
          </button>
          <button
            className={tool === "circle" ? "pill" : "btn"}
            onClick={() => setTool("circle")}
            title="Circle"
          >
            <Circle size={18} />
          </button>
          <button
            className={tool === "rectangle" ? "pill" : "btn"}
            onClick={() => setTool("rectangle")}
            title="Rectangle"
          >
            <Square size={18} />
          </button>
          <button
            className={tool === "text" ? "pill" : "btn"}
            onClick={() => setTool("text")}
            title="Text"
          >
            <Type size={18} />
          </button>

          <div style={{ width: 1, height: 24, background: "#1a2436" }} />

          {/* Color picker */}
          <div style={{ position: "relative" }}>
            <button
              className="btn"
              onClick={() => setShowColorPicker(!showColorPicker)}
              style={{ padding: 8 }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: color
                }}
              />
            </button>
            {showColorPicker && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#0d1420",
                  border: "1px solid #1a2436",
                  borderRadius: 8,
                  padding: 8,
                  display: "flex",
                  gap: 4,
                  marginBottom: 8
                }}
              >
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColor(c);
                      setShowColorPicker(false);
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      background: c,
                      border: color === c ? "2px solid white" : "none",
                      cursor: "pointer"
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Stroke width */}
          <button
            className="btn"
            onClick={() => {
              const idx = STROKE_WIDTHS.indexOf(strokeWidth);
              setStrokeWidth(STROKE_WIDTHS[(idx + 1) % STROKE_WIDTHS.length]);
            }}
            title={`Stroke: ${strokeWidth}px`}
            style={{ padding: 8 }}
          >
            <div
              style={{
                width: 18,
                height: strokeWidth,
                background: "currentColor",
                borderRadius: 2
              }}
            />
          </button>
        </div>
      )}
    </>
  );
}


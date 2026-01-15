import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { auth, db, storage } from "../../../lib/firebase";

// Asegúrate de tener instalado: npm install @jitsi/react-sdk
import { JaaSMeeting } from "@jitsi/react-sdk";

export default function CourseLessonsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  // Para agregar/editar lección
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("text");
  const [adding, setAdding] = useState(false);

  // Para campos dinámicos
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [jitsiRoom, setJitsiRoom] = useState(""); 
  const [recordingUrl, setRecordingUrl] = useState(""); 

  // Para quizzes
  const [questions, setQuestions] = useState([
    { question: "", options: ["", "", "", ""], correct: 0 },
  ]);

  // Para editar descripción
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [newDescription, setNewDescription] = useState("");

  // Para imagen de portada
  const [isEditingCover, setIsEditingCover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null); 
  const [previewUrl, setPreviewUrl] = useState(""); 

  // Estado para edición de lección
  const [editingLesson, setEditingLesson] = useState(null);

  // Estado para alumnos inscritos y calificaciones
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [grades, setGrades] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Para videoconferencia
  const [isJitsiModalOpen, setIsJitsiModalOpen] = useState(false);
  const [currentLiveLesson, setCurrentLiveLesson] = useState(null);
  const [jitsiJwt, setJitsiJwt] = useState(null); 
  const [loadingJitsi, setLoadingJitsi] = useState(false); 

  // Validar URL
  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    if (!Array.isArray(questions)) {
      setQuestions([{ question: "", options: ["", "", "", ""], correct: 0 }]);
    }
  }, [questions]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        router.push("/login");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user || !id) return;

    const loadCourse = async () => {
      try {
        const courseDocRef = doc(db, "courses", id);
        const courseDocSnap = await getDoc(courseDocRef);

        if (!courseDocSnap.exists()) {
          setError("Curso no encontrado.");
          return;
        }

        const data = courseDocSnap.data();
        if (data.teacherId !== user.uid) {
          setError("No tienes permiso para editar este curso.");
        } else {
          setCourse(data);
          setNewDescription(data.description || "");
          setPreviewUrl(data.imageUrl || "");
        }
      } catch (err) {
        setError("Error al cargar el curso.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadCourse();
  }, [user, id]);

  useEffect(() => {
    if (!user || !id || !course) return;

    const loadEnrolledStudents = async () => {
      setLoadingStudents(true);
      try {
        const enrollmentsRef = collection(db, "enrollments");
        const q = query(enrollmentsRef, where("courseId", "==", id));
        const querySnapshot = await getDocs(q);

        const studentsList = [];
        const gradesMap = {};

        for (const docSnap of querySnapshot.docs) {
          const enrollment = docSnap.data();
          const userId = enrollment.userId;

          if (userId && typeof userId === "string" && userId.trim() !== "") {
            const userDocRef = doc(db, "users", userId);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              const studentToAdd = {
                id: userId,
                enrollmentId: docSnap.id,
                name: userData.name || userData.email || "Sin nombre",
                email: userData.email || "Sin email",
                grade: enrollment.grade || null,
              };
              studentsList.push(studentToAdd);
              gradesMap[userId] = enrollment.grade || "";
            }
          }
        }
        setEnrolledStudents(studentsList);
        setGrades(gradesMap);
      } catch (err) {
        console.error("Error al cargar alumnos inscritos:", err);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadEnrolledStudents();
  }, [user, id, course]);

  const handleGradeChange = (studentId, value) => {
    if (value === "" || (parseFloat(value) >= 0 && parseFloat(value) <= 10)) {
      setGrades((prev) => ({ ...prev, [studentId]: value }));
    }
  };

  const saveGrade = async (studentId) => {
    const gradeValue = grades[studentId];
    if (gradeValue === "") return;
    const numericGrade = parseFloat(gradeValue);
    
    try {
      const enrollmentsRef = collection(db, "enrollments");
      const q = query(enrollmentsRef, where("userId", "==", studentId), where("courseId", "==", id));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const enrollmentDocRef = doc(db, "enrollments", querySnapshot.docs[0].id);
        await updateDoc(enrollmentDocRef, { grade: numericGrade });
        setEnrolledStudents(prev => prev.map(s => s.id === studentId ? { ...s, grade: numericGrade } : s));
        alert("Calificación guardada.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar.");
    }
  };

  const uploadCoverImage = async () => {
    if (!file) return;
    try {
      setUploading(true);
      const imagePath = `courses/${id}/cover.jpg`;
      const imageRef = ref(storage, imagePath);
      await uploadBytes(imageRef, file);
      const downloadUrl = await getDownloadURL(imageRef);
      await updateDoc(doc(db, "courses", id), { imageUrl: downloadUrl });
      setCourse({ ...course, imageUrl: downloadUrl });
      setIsEditingCover(false);
      alert("Imagen actualizada.");
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const startEditingLesson = (lesson) => {
    setEditingLesson(lesson);
    setTitle(lesson.title);
    setType(lesson.type);
    if (lesson.type === "text") setContent(lesson.content || "");
    else if (lesson.type === "video") setVideoUrl(lesson.content || "");
    else if (lesson.type === "pdf") setPdfUrl(lesson.content || "");
    else if (lesson.type === "live") {
      setJitsiRoom(lesson.content.replace(`${id}_`, ""));
      setRecordingUrl(lesson.recordingUrl || "");
    }
    else if (lesson.type === "quiz") setQuestions(JSON.parse(JSON.stringify(lesson.content)));
  };

  const cancelEdit = () => {
    setEditingLesson(null);
    setTitle("");
    setContent("");
    setVideoUrl("");
    setPdfUrl("");
    setJitsiRoom("");
    setRecordingUrl("");
    setQuestions([{ question: "", options: ["", "", "", ""], correct: 0 }]);
    setType("text");
  };

  const handleAddLesson = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      let lessonContent = "";
      if (type === "text") lessonContent = content;
      else if (type === "video") lessonContent = videoUrl;
      else if (type === "pdf") lessonContent = pdfUrl;
      else if (type === "live") lessonContent = `${id}_${jitsiRoom}`;
      else if (type === "quiz") lessonContent = questions;

      const newLesson = {
        id: editingLesson ? editingLesson.id : `les_${Date.now()}`,
        title: title.trim(),
        type,
        content: lessonContent,
        order: editingLesson ? editingLesson.order : course.lessons?.length || 0,
        createdAt: editingLesson ? editingLesson.createdAt : new Date(),
        recordingUrl: type === "live" ? recordingUrl : null
      };

      const updatedLessons = editingLesson
        ? course.lessons.map((l) => (l.id === editingLesson.id ? newLesson : l))
        : [...(course.lessons || []), newLesson];

      await updateDoc(doc(db, "courses", id), { lessons: updatedLessons });
      setCourse({ ...course, lessons: updatedLessons });
      cancelEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  const joinLiveLessonAsTeacher = async (lesson) => {
    setLoadingJitsi(true);
    setCurrentLiveLesson(lesson);
    setIsJitsiModalOpen(true);
    try {
      const response = await fetch("/api/generateJitsiJwt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: lesson.content,
          role: "moderator",
          userInfo: { displayName: user?.email, email: user?.email },
        }),
      });
      const { jwt } = await response.json();
      setJitsiJwt(jwt);
    } catch (error) {
      console.error(error);
      setIsJitsiModalOpen(false);
    } finally {
      setLoadingJitsi(false);
    }
  };

  if (loading || !user) return <div className="p-10 text-center">Cargando...</div>;

  return (
    <div className="min-h-screen p-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <button onClick={() => router.back()} className="mb-4 text-blue-600">← Volver</button>
        <h1 className="text-2xl font-bold">{course.title}</h1>
        
        <div className="mt-4">
          <img src={previewUrl || "/placeholder.jpg"} className="w-full h-48 object-cover rounded" />
          <button onClick={() => setIsEditingCover(true)} className="text-sm text-blue-500 mt-2">Editar Imagen</button>
        </div>

        {isEditingCover && (
          <div className="mt-4 border p-4 rounded">
            <input type="file" onChange={handleFileChange} />
            <button onClick={uploadCoverImage} className="bg-green-600 text-white px-4 py-1 rounded ml-2">Subir</button>
            <button onClick={() => setIsEditingCover(false)} className="ml-2">Cancelar</button>
          </div>
        )}

        <div className="mt-6">
          <h2 className="font-semibold">Descripción:</h2>
          <p className="text-gray-600">{course.description}</p>
        </div>
      </div>

      <div className="space-y-6">
        <form onSubmit={handleAddLesson} className="bg-white p-6 rounded shadow">
          <h2 className="text-lg font-bold mb-4">{editingLesson ? "Editar" : "Nueva"} Lección</h2>
          <input 
            type="text" value={title} onChange={(e) => setTitle(e.target.value)} 
            placeholder="Título" className="w-full p-2 border mb-4 rounded" required 
          />
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 border mb-4 rounded">
            <option value="text">Texto</option>
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="live">Vivo</option>
            <option value="quiz">Quiz</option>
          </select>

          {type === "text" && <textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full p-2 border rounded" />}
          {type === "video" && <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="w-full p-2 border rounded" placeholder="URL Video" />}
          {type === "live" && (
             <div className="space-y-2">
                <input type="text" value={jitsiRoom} onChange={(e) => setJitsiRoom(e.target.value)} className="w-full p-2 border rounded" placeholder="Nombre sala" />
                <input type="text" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} className="w-full p-2 border rounded" placeholder="URL Grabación" />
             </div>
          )}

          <div className="mt-4 flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Guardar</button>
            {editingLesson && <button type="button" onClick={cancelEdit} className="bg-gray-400 text-white px-4 py-2 rounded">Cancelar</button>}
          </div>
        </form>

        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-lg font-bold mb-4">Lista de Lecciones</h2>
          {course.lessons?.map((lesson) => (
            <div key={lesson.id} className="border-b py-3 flex justify-between items-center">
              <span>{lesson.title} ({lesson.type})</span>
              <div className="flex gap-2">
                {lesson.type === "live" && (
                  <button onClick={() => joinLiveLessonAsTeacher(lesson)} className="text-green-600 text-sm">Iniciar</button>
                )}
                <button onClick={() => startEditingLesson(lesson)} className="text-blue-600 text-sm">Editar</button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-lg font-bold mb-4">Alumnos e Inscritos</h2>
          {loadingStudents ? <p>Cargando alumnos...</p> : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Nombre</th>
                  <th>Nota</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {enrolledStudents.map(student => (
                  <tr key={student.id} className="border-b">
                    <td className="py-2">{student.name}</td>
                    <td>
                      <input 
                        type="number" value={grades[student.id] || ""} 
                        onChange={(e) => handleGradeChange(student.id, e.target.value)}
                        className="w-16 p-1 border rounded"
                      />
                    </td>
                    <td>
                      <button onClick={() => saveGrade(student.id)} className="text-blue-600">OK</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isJitsiModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col z-50">
          <div className="p-4 flex justify-between bg-white">
            <h2 className="font-bold">Clase en Vivo: {currentLiveLesson?.title}</h2>
            <button onClick={() => setIsJitsiModalOpen(false)} className="text-red-600 font-bold">Cerrar</button>
          </div>
          <div className="flex-1">
            {loadingJitsi ? <p className="text-white p-10">Generando acceso...</p> : (
              jitsiJwt && (
                <JaaSMeeting
                  appId={process.env.NEXT_PUBLIC_JITSI_APP_ID}
                  roomName={currentLiveLesson.content}
                  jwt={jitsiJwt}
                  configOverwrite={{ disableThirdPartyRequests: true, roles: { moderator: true } }}
                  getIFrameRef={(node) => (node.style.height = "100%")}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
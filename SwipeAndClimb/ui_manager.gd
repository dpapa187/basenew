extends CanvasLayer

## Handles HUD updates, marketing modals, and user interactions.

onready var score_label: Label = $ScoreLabel
onready var tip_popup: Panel = $TipPopup
onready var tip_label: RichTextLabel = $TipPopup/TipLabel
onready var email_modal: Panel = $EmailModal
onready var email_input: LineEdit = $EmailModal/EmailLineEdit
onready var game_over_panel: Panel = $GameOver
onready var game_over_label: RichTextLabel = $GameOver/GameOverLabel
onready var controller: Node = get_parent()

var modal_open: bool = false

func update_score(floor: int, score: int) -> void:
    score_label.text = "Floor: %d  |  Ideas: %d" % [floor, score]

func show_tip(text: String) -> void:
    modal_open = true
    tip_label.text = text
    tip_popup.visible = true
    if controller.has_method("pause_for_modal"):
        controller.pause_for_modal()
    _play_sfx("Tip")
    await get_tree().create_timer(2.0).timeout
    tip_popup.visible = false
    modal_open = false
    if controller.has_method("resume_after_modal"):
        controller.resume_after_modal()

func show_email_gate() -> void:
    modal_open = true
    email_modal.visible = true
    email_input.text = ""
    email_input.grab_focus()
    if controller.has_method("pause_for_modal"):
        controller.pause_for_modal()

func show_game_over(final_score: int) -> void:
    modal_open = true
    game_over_panel.visible = true
    game_over_label.text = "[center]Game Over!\nIdeas Bank: %d[/center]" % final_score
    if controller.has_method("pause_for_modal"):
        controller.pause_for_modal()
    if controller.has_method("show_affiliate_ad"):
        controller.show_affiliate_ad()

func hide_game_over() -> void:
    game_over_panel.visible = false
    modal_open = false

func is_modal_open() -> bool:
    return modal_open or tip_popup.visible or email_modal.visible or game_over_panel.visible

func _on_retry_pressed() -> void:
    hide_game_over()
    if controller.has_method("reset_game"):
        controller.reset_game()

func _on_bonus_pressed() -> void:
    OS.shell_open("https://d-papa.com/bonus")

func _on_email_submit_pressed() -> void:
    var email := email_input.text.strip_edges()
    print("[EmailGate] Captured email:", email)
    email_modal.visible = false
    modal_open = false
    if controller.has_method("resume_after_modal"):
        controller.resume_after_modal()

func _play_sfx(node_name: String) -> void:
    var sfx_parent := get_tree().get_root().find_node("SFX", true, false)
    if sfx_parent:
        var sfx: AudioStreamPlayer = sfx_parent.get_node_or_null(node_name)
        if sfx:
            sfx.play()
